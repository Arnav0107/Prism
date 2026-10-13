import { decodeErrorResult, type Abi } from 'viem';
import PrismVaultAbi from './abi/PrismVault.json';
import PrismAuctionAbi from './abi/PrismAuction.json';
import EpochCouponAbi from './abi/EpochCoupon.json';
import PrincipalTokenAbi from './abi/PrincipalToken.json';
import MockStockAbi from './abi/MockStock.json';
import MockUSDCAbi from './abi/MockUSDC.json';

export const OPENZEPPELIN_ERRORS_ABI = [
  {
    type: 'error',
    name: 'ERC20InsufficientAllowance',
    inputs: [
      { name: 'spender', type: 'address', internalType: 'address' },
      { name: 'allowance', type: 'uint256', internalType: 'uint256' },
      { name: 'needed', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'ERC20InsufficientBalance',
    inputs: [
      { name: 'sender', type: 'address', internalType: 'address' },
      { name: 'balance', type: 'uint256', internalType: 'uint256' },
      { name: 'needed', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'ERC20InvalidApprover',
    inputs: [{ name: 'approver', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'ERC20InvalidReceiver',
    inputs: [{ name: 'receiver', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'ERC20InvalidSender',
    inputs: [{ name: 'sender', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'ERC20InvalidSpender',
    inputs: [{ name: 'spender', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'ERC1155InsufficientBalance',
    inputs: [
      { name: 'sender', type: 'address', internalType: 'address' },
      { name: 'balance', type: 'uint256', internalType: 'uint256' },
      { name: 'needed', type: 'uint256', internalType: 'uint256' },
      { name: 'tokenId', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'ERC1155InvalidApprover',
    inputs: [{ name: 'approver', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'ERC1155InvalidArrayLength',
    inputs: [
      { name: 'idsLength', type: 'uint256', internalType: 'uint256' },
      { name: 'valuesLength', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'ERC1155InvalidOperator',
    inputs: [{ name: 'operator', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'ERC1155InvalidReceiver',
    inputs: [{ name: 'receiver', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'ERC1155InvalidSender',
    inputs: [{ name: 'sender', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'ERC1155MissingApprovalForAll',
    inputs: [
      { name: 'operator', type: 'address', internalType: 'address' },
      { name: 'owner', type: 'address', internalType: 'address' },
    ],
  },
] as const;

export const MERGED_ABI: Abi = [
  ...(PrismVaultAbi as unknown as Abi),
  ...(PrismAuctionAbi as unknown as Abi),
  ...(EpochCouponAbi as unknown as Abi),
  ...(PrincipalTokenAbi as unknown as Abi),
  ...(MockStockAbi as unknown as Abi),
  ...(MockUSDCAbi as unknown as Abi),
  ...(OPENZEPPELIN_ERRORS_ABI as unknown as Abi),
];

const ALL_ABIS: Abi[] = [
  MERGED_ABI,
  PrismVaultAbi as unknown as Abi,
  PrismAuctionAbi as unknown as Abi,
  EpochCouponAbi as unknown as Abi,
  PrincipalTokenAbi as unknown as Abi,
  MockStockAbi as unknown as Abi,
  MockUSDCAbi as unknown as Abi,
];

/**
 * Human-readable mapping for Prism custom smart contract errors.
 */
export function formatCustomErrorMessage(errorName: string, args?: readonly unknown[]): string {
  switch (errorName) {
    case 'ZeroAddress':
      return 'Action rejected: zero address provided.';
    case 'ZeroAmount':
      return 'Amount must be greater than zero.';
    case 'ExDateMustBeFuture':
      return 'Ex-dividend date must be in the future.';
    case 'PayDateBeforeExDate':
      return 'Payment date cannot precede the ex-dividend date.';
    case 'ExDateNotIncreasing':
      return 'Ex-dividend dates must be strictly increasing.';
    case 'EpochDoesNotExist': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `Epoch ${id ? id + ' ' : ''}does not exist on-chain.`;
    }
    case 'EpochAlreadyFunded': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `This epoch ${id ? '(' + id + ') ' : ''}is already funded.`;
    }
    case 'EpochNotFunded': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `This epoch ${id ? '(' + id + ') ' : ''}is not yet funded with dividend USDC.`;
    }
    case 'DividendNotDeclared': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `No dividend has been declared for epoch ${id || ''}.`;
    }
    case 'NonDividendActionType':
      return 'Corporate action declared is not an eligible cash dividend.';
    case 'ExDateNotReached': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `Ex-dividend date has not yet passed for epoch ${id || ''}.`;
    }
    case 'FutureEpochsRemain':
      return 'Cannot redeem Principal Token while active future quarterly epochs remain.';
    case 'InsufficientBalance':
      return 'Insufficient token balance to complete this transaction.';
    case 'ERC20InsufficientBalance':
      return 'ERC20InsufficientBalance: Insufficient token balance to complete this transaction.';
    case 'ERC1155InsufficientBalance':
      return 'ERC1155InsufficientBalance: Insufficient coupon balance to complete this transaction.';
    case 'ERC20InsufficientAllowance':
      return 'ERC20InsufficientAllowance: Insufficient token allowance. Please approve the contract first.';
    case 'ERC20InvalidSender':
      return 'ERC20InvalidSender: Transaction sender is invalid or address(0). Reconnect wallet.';
    case 'ERC20InvalidReceiver':
      return 'ERC20InvalidReceiver: Recipient address is invalid.';
    case 'ERC20InvalidApprover':
      return 'ERC20InvalidApprover: Approver address is invalid.';
    case 'ERC20InvalidSpender':
      return 'ERC20InvalidSpender: Spender address is invalid.';
    case 'InvalidDuration':
      return 'Auction decay duration must be greater than zero.';
    case 'ArrayLengthMismatch':
      return 'Mismatched array parameters.';
    case 'AuctionNotFound': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `Auction ${id ? '#' + id + ' ' : ''}not found.`;
    }
    case 'AuctionNotActive': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `Auction ${id ? '#' + id + ' ' : ''}is no longer active or has already completed.`;
    }
    case 'EpochPastExDate': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `Epoch ${id ? '(' + id + ') ' : ''}has already reached its ex-dividend date. Trading is closed.`;
    }
    case 'SlippageExceeded': {
      const current = args && args[0] !== undefined ? Number(args[0]) / 1e6 : null;
      const max = args && args[1] !== undefined ? Number(args[1]) / 1e6 : null;
      if (current !== null && max !== null) {
        return `Price moved above your limit. Current price: $${current.toFixed(4)}, Max: $${max.toFixed(4)}.`;
      }
      return 'Price moved above your max limit (slippage exceeded).';
    }
    case 'InsufficientAuctionLiquidity': {
      return 'Requested quantity exceeds the remaining tokens available in this auction.';
    }
    case 'OnlySeller':
      return 'Only the original seller can cancel this auction.';
    case 'EpochsSealed':
      return 'Epoch creation is sealed. Schedule cannot be modified after launch or first deposit.';
    case 'MaxEpochsExceeded':
      return 'Maximum number of distribution epochs (16) reached.';
    case 'MaxHorizonExceeded':
      return 'Epoch ex-date exceeds maximum horizon (400 days).';
    case 'CannotEnableDemoMode':
      return 'Demo mode cannot be re-enabled after protocol launch.';
    case 'UnsupportedCollateral':
      return 'Collateral transfer failed 1:1 balance check. Fee-on-transfer or rebasing tokens are unsupported.';
    case 'EventNotLocked': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `Corporate action for epoch ${id ? id + ' ' : ''}must be locked before funding.`;
    }
    case 'EventAlreadyLocked': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `Corporate action for epoch ${id ? id + ' ' : ''}is locked and immutable.`;
    }
    case 'EpochAwaitingFunding': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `Epoch ${id ? id + ' ' : ''}is awaiting dividend funding. Principal redemptions are blocked during the 30-day grace window.`;
    }
    case 'FillBelowMinimum':
      return 'Order size is below the minimum fill threshold (0.001 coupons) unless filling the entire remaining auction.';
    case 'DividendNotLocked': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `Dividend for epoch ${id ? id + ' ' : ''}is not locked. Secondary auctions cannot trade changeable dividends.`;
    }
    case 'SelfTrade':
      return 'Self-trading is not permitted: buyer cannot be the auction seller.';
    case 'CollateralShortfall':
      return 'Vault collateral shortfall detected: underlying balance is less than Principal Token supply.';
    case 'EnforcedPause':
      return 'Action blocked: protocol is currently paused by the guardian.';
    case 'NoEpochs':
      return 'Cannot proceed: vault contains no distribution epochs.';
    case 'FundingDefaulted': {
      const id = args && args[0] !== undefined ? String(args[0]) : '';
      return `Epoch ${id ? id + ' ' : ''}dividend funding has defaulted past the grace period.`;
    }
    case 'AuctionExtendsPastExDate':
      return 'Auction decay duration extends past the epoch ex-dividend date.';
    case 'InvalidPrice':
      return 'Invalid price: starting price exceeds maximum allowable price or is below floor price.';
    case 'NotGuardian':
      return 'Unauthorized: caller is not the guardian or contract owner.';
    case 'NotPendingGuardian':
      return 'Unauthorized: caller is not the designated pending guardian.';
    case 'ReentrancyGuardReentrantCall':
      return 'Transaction reentrancy guard triggered.';
    default:
      return `Contract reverted with error: ${errorName}`;
  }
}

/**
 * Attempts to extract and decode custom revert errors from any Viem/Ethers/Web3 exception.
 */
export function decodeContractError(err: unknown): string {
  if (!err) return 'Unknown error occurred.';

  // Check user cancellation
  const rawMsg = typeof err === 'object' && err !== null && 'message' in err ? String(err.message) : String(err);
  if (/user rejected|user denied|rejected by user/i.test(rawMsg)) {
    return 'Transaction was cancelled by user in wallet.';
  }

  // Look for error data inside error object hierarchy
  let errorDataHex: `0x${string}` | undefined;

  const candidate = err as Record<string, unknown>;

  // Check viem error walking
  if (typeof (candidate as any).walk === 'function') {
    const found = (candidate as any).walk((e: any) => typeof e?.data === 'string' && e.data.startsWith('0x'));
    if (found && typeof found.data === 'string') {
      errorDataHex = found.data as `0x${string}`;
    }
  }

  // Check direct properties
  if (!errorDataHex) {
    if (typeof candidate.data === 'string' && candidate.data.startsWith('0x')) {
      errorDataHex = candidate.data as `0x${string}`;
    } else if (candidate.data && typeof (candidate.data as any).data === 'string' && (candidate.data as any).data.startsWith('0x')) {
      errorDataHex = (candidate.data as any).data as `0x${string}`;
    } else if (candidate.cause && typeof candidate.cause === 'object') {
      const causeObj = candidate.cause as Record<string, unknown>;
      if (typeof causeObj.data === 'string' && causeObj.data.startsWith('0x')) {
        errorDataHex = causeObj.data as `0x${string}`;
      } else if (causeObj.cause && typeof (causeObj.cause as any).data === 'string' && (causeObj.cause as any).data.startsWith('0x')) {
        errorDataHex = (causeObj.cause as any).data as `0x${string}`;
      }
    }
  }

  // Fallback: extract hex string from error message
  if (!errorDataHex) {
    const hexMatch = rawMsg.match(/0x[a-fA-F0-9]{8,}/);
    if (hexMatch) {
      errorDataHex = hexMatch[0] as `0x${string}`;
    }
  }

  // If hex data found, attempt decode against our merged and individual ABIs
  if (errorDataHex && errorDataHex.length >= 10) {
    for (const abi of ALL_ABIS) {
      try {
        const decoded = decodeErrorResult({
          abi,
          data: errorDataHex,
        });
        if (decoded && decoded.errorName) {
          return formatCustomErrorMessage(decoded.errorName, decoded.args as readonly unknown[]);
        }
      } catch {
        // Continue trying other ABIs
      }
    }
  }

  // Match common error strings directly from message
  const errorNameMatch = rawMsg.match(
    /\b(ZeroAddress|ZeroAmount|ExDateMustBeFuture|PayDateBeforeExDate|ExDateNotIncreasing|EpochDoesNotExist|EpochAlreadyFunded|EpochNotFunded|DividendNotDeclared|NonDividendActionType|ExDateNotReached|FutureEpochsRemain|InsufficientBalance|InvalidDuration|ArrayLengthMismatch|AuctionNotFound|AuctionNotActive|EpochPastExDate|SlippageExceeded|InsufficientAuctionLiquidity|OnlySeller|ERC20InsufficientBalance|ERC20InsufficientAllowance|ERC20InvalidSender|ERC20InvalidReceiver|ERC20InvalidApprover|ERC20InvalidSpender|ERC1155InsufficientBalance|ERC1155MissingApprovalForAll|DividendNotLocked|SelfTrade|CollateralShortfall|EnforcedPause|NoEpochs|FundingDefaulted|AuctionExtendsPastExDate|InvalidPrice)\b/
  );

  if (errorNameMatch) {
    return formatCustomErrorMessage(errorNameMatch[1]);
  }

  // Fallback to cleaned readable message
  const detailsMatch = rawMsg.match(/details:\s*([^\n\r]+)/i);
  if (detailsMatch) {
    return detailsMatch[1].trim();
  }

  const shortMessageMatch = rawMsg.match(/shortMessage:\s*([^\n\r]+)/i);
  if (shortMessageMatch) {
    return shortMessageMatch[1].trim();
  }

  if (rawMsg.trim().toLowerCase() === 'execution reverted' || rawMsg.includes('transaction execution reverted')) {
    return 'Transaction execution reverted on-chain. Please verify token allowance and balance.';
  }

  return rawMsg.length > 120 ? rawMsg.slice(0, 117) + '...' : rawMsg;
}
