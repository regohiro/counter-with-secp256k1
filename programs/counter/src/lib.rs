mod error;

use anchor_lang::prelude::*;
use error::ErrorCodes::*;
use solana_program::sysvar::instructions;

declare_id!("B6PnZuXyucDyREe3hpuEwTQPeQnzKjyAVqaBwxFkzrSp");

#[program]
mod counter {
  use super::*;

  const ETH_ADDRESS_OFFSET: usize = 12;
  const MESSAGE_OFFSET: usize = 97;

  pub fn create(ctx: Context<Create>, signer_address: [u8; 20]) -> Result<()> {
    let counter = &mut ctx.accounts.counter;
    counter.signer_address = signer_address;
    counter.count = 0;
    counter.nonce = 0;
    Ok(())
  }

  pub fn increment(ctx: Context<Increment>) -> Result<()> {
    msg!("Increment");
    let counter = &mut ctx.accounts.counter;

    //Get sysvar instruction account info
    let ix_account = &ctx.accounts.sysvar_instruction;
    //Get current instruction index
    let current_ix_index = instructions::load_current_index_checked(ix_account)?;

    //The current instruction must be one after secp verification instruction
    if current_ix_index != 1 {
      return Err(InstructionAtWrongIndex.into());
    }

    // The previous ix must be a secp verification instruction
    let secp_ix_index = (current_ix_index - 1) as u8;
    let secp_ix = instructions::load_instruction_at_checked(secp_ix_index.into(), ix_account)
      .map_err(|_| ProgramError::InvalidAccountData)?;

    // Check that the instruction is actually for the secp program
    if secp_ix.program_id != solana_program::secp256k1_program::id() {
      return Err(InvalidSecpInstruction.into());
    }

    //Only single recovery expected
    let secp_ix_data = secp_ix.data;
    if secp_ix_data.len() < 2 {
      return Err(InvalidSecpInstruction.into());
    }
    if secp_ix_data[0] != 1 {
      return Err(InvalidSecpInstruction.into());
    }

    //Validate signature
    let ix_signer = secp_ix_data[ETH_ADDRESS_OFFSET..ETH_ADDRESS_OFFSET + 20].to_vec();
    if ix_signer != counter.signer_address {
      return Err(InvalidSecpSignature.into());
    }

    //Validate message(nonce)
    let message = secp_ix_data[MESSAGE_OFFSET..].to_vec();

    if message != counter.nonce.to_be_bytes() {
      return Err(InvalidSecpNonce.into());
    }

    //Increment nonce
    counter.nonce += 1;

    //Increment counter
    counter.count += 1;

    Ok(())
  }
}

#[derive(Accounts)]
pub struct Create<'info> {
  #[account(init, payer = user, space = 8 + 20 + 8 + 8)]
  counter: Account<'info, Counter>,
  #[account(mut)]
  user: Signer<'info>,
  system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
  #[account(mut)]
  counter: Account<'info, Counter>,
  /// CHECK: This is required for instruction introspection
  sysvar_instruction: AccountInfo<'info>,
}

#[account]
pub struct Counter {
  pub signer_address: [u8; 20],
  pub count: u64,
  pub nonce: u64,
}
