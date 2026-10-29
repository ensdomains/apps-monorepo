import { type Address, type Transaction, toFunctionSelector } from 'viem'

const EXEC_TRANSACTION = toFunctionSelector(
  'execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)',
)

/**
 * The account a transaction acted as. A Safe's `execTransaction` is sent by an
 * owner or a relayer, but only runs with the owners' signatures, so the Safe is
 * the sender.
 */
export const getTransactionSender = ({
  from,
  to,
  input,
}: Pick<Transaction, 'from' | 'to' | 'input'>): Address =>
  to && input.slice(0, 10).toLowerCase() === EXEC_TRANSACTION ? to : from
