import * as anchor from "@project-serum/anchor";
import { Program, Provider, BN } from "@project-serum/anchor";
import {
  Ed25519Program,
  Keypair,
  Message,
  PublicKey,
  Secp256k1Program,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import chai, { expect, assert } from "chai";
import chaiAsPromised from "chai-as-promised";
import { IDL, Counter } from "../target/types/counter";
import secp256k1 from "secp256k1";
import keccak256 from "keccak256";

chai.use(chaiAsPromised);

const Counter_PROGRAM_ID = new PublicKey("B6PnZuXyucDyREe3hpuEwTQPeQnzKjyAVqaBwxFkzrSp");
const delay = (ms: number): Promise<PromiseConstructor> => new Promise(resolve => setTimeout(resolve, ms));

const getSignerKey = () => {
  let signerKeypair: Keypair;
  let signerPrivateKey: Uint8Array;
  do {
    signerKeypair = Keypair.generate();
    signerPrivateKey = signerKeypair.secretKey.slice(0, 32);
  } while (!secp256k1.privateKeyVerify(signerPrivateKey));

  const secp256k1PublicKey = secp256k1.publicKeyCreate(signerPrivateKey, false).slice(1);
  const signerEthAddress =
    Secp256k1Program.publicKeyToEthAddress(secp256k1PublicKey).toString("hex");

  return {
    signerKeypair,
    signerPrivateKey,
    signerEthAddress,
  };
};

describe("Signature test", () => {
  //Set rpc
  const provider = anchor.Provider.local();
  const { connection } = provider;
  anchor.setProvider(provider);

  //Clients
  let authorityClient: Program<Counter>;
  let userClient: Program<Counter>;

  //Keypair & Wallet
  const authorityKeypair = Keypair.generate();
  const authorityWallet = new anchor.Wallet(authorityKeypair);
  const { signerKeypair, signerPrivateKey, signerEthAddress } = getSignerKey();
  const userKeypair = Keypair.generate();
  const userWallet = new anchor.Wallet(userKeypair);
  console.log("authoriy: ", authorityKeypair.publicKey.toBase58());
  console.log("user    : ", userKeypair.publicKey.toBase58());
  console.log("signer  : ", signerKeypair.publicKey.toBase58());

  // Counter for the tests.
  const counter = Keypair.generate();
  console.log("counter : ", counter.publicKey.toBase58());

  it("Creates program clients", () => {
    authorityClient = new Program<Counter>(
      IDL,
      Counter_PROGRAM_ID,
      new Provider(connection, authorityWallet, Provider.defaultOptions()),
    );

    userClient = new Program<Counter>(
      IDL,
      Counter_PROGRAM_ID,
      new Provider(connection, userWallet, Provider.defaultOptions()),
    );
  });

  it("Funds users", async () => {
    const tx = new Transaction();
    tx.add(
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: authorityKeypair.publicKey,
        lamports: 100 * 10 ** 9,
      }),
    );
    tx.add(
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: userKeypair.publicKey,
        lamports: 100 * 10 ** 9,
      }),
    );
    await anchor.getProvider().send(tx);
  });

  it("Creates a counter", async () => {
    await authorityClient.methods
      .create([...anchor.utils.bytes.hex.decode(signerEthAddress)])
      .accounts({
        counter: counter.publicKey,
        user: authorityKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([counter])
      .rpc();
  });

  it("Has correct initial settings", async () => {
    const counterAccount = await authorityClient.account.counter.fetch(counter.publicKey);
    expect(counterAccount.count.toNumber()).to.eq(0);
    expect(counterAccount.nonce.toNumber()).to.eq(0);
    expect(counterAccount.signerAddress).to.deep.equal([
      ...anchor.utils.bytes.hex.decode(signerEthAddress),
    ]);
  });

  it("Signs message nonce and verifies", async () => {
    const { nonce } = await authorityClient.account.counter.fetch(counter.publicKey);
    const message = new Uint8Array(nonce.toBuffer());
    const messageHash = keccak256(Buffer.from(message));
    const { signature, recid } = secp256k1.ecdsaSign(messageHash, signerPrivateKey);

    const tx = new Transaction({
      recentBlockhash: (await provider.connection.getLatestBlockhash()).blockhash,
      feePayer: authorityKeypair.publicKey,
    }).add(
      Secp256k1Program.createInstructionWithEthAddress({
        ethAddress: signerEthAddress,
        message,
        signature,
        recoveryId: recid
      })
    )

    await provider.send(tx);
  });

  it("Signs and increments with signature", async () => {
    const { nonce } = await authorityClient.account.counter.fetch(counter.publicKey);
    const message = new Uint8Array(nonce.toBuffer("be", 8));
    const messageHash = keccak256(Buffer.from(message));
    const { signature, recid } = secp256k1.ecdsaSign(messageHash, signerPrivateKey);

    const tx = new Transaction({
      recentBlockhash: (await provider.connection.getLatestBlockhash()).blockhash,
      feePayer: userKeypair.publicKey,
    }).add(
      Secp256k1Program.createInstructionWithEthAddress({
        ethAddress: signerEthAddress,
        message,
        signature,
        recoveryId: recid
      })
    ).add(
      userClient.instruction.increment({
        accounts: {
          counter: counter.publicKey,
          sysvarInstruction: SYSVAR_INSTRUCTIONS_PUBKEY
        }
      })
    )
    const signedTx = await userWallet.signTransaction(tx);
    const txhash = await connection.sendRawTransaction(signedTx.serialize());  
    await connection.confirmTransaction(txhash, "confirmed");

    const counterAccount = await authorityClient.account.counter.fetch(counter.publicKey);
    expect(counterAccount.count.toNumber()).to.eq(1);
    expect(counterAccount.nonce.toNumber()).to.eq(1);
  });
});
