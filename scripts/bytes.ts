import { BN } from "@project-serum/anchor";
import keccak256 from "keccak256";

const main = async () => {
  const num = new BN(463782916);
  console.log("num: ", num);
  const numArray = num.toArray();
  console.log("numArray: ", numArray);
  const numUint8Array = new Uint8Array(num.toBuffer("be", 8));
  console.log("numUint8Array: ", numUint8Array);

  const hash1 = keccak256(num.toBuffer("be", 8));
  console.log("hash1: ", hash1);
  const hash2 = keccak256(Buffer.from(numUint8Array));
  console.log("hash2: ", hash2);
};

main()
  .then(() => process.exit(0))
  .catch((err: Error) => {
    console.error(err);
    process.exit(1);
  });
