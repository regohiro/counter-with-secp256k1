use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCodes {
  #[msg("InstructionAtWrongIndex")]
  InstructionAtWrongIndex,
  #[msg("InvalidSecpInstruction")]
  InvalidSecpInstruction,
  #[msg("InvalidSecpSignature")]
  InvalidSecpSignature,
  #[msg("InvalidSecpNonce")]
  InvalidSecpNonce
}