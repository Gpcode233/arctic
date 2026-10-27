// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IERC4626 {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function convertToAssets(uint256 shares) external view returns (uint256);
}

/**
 * @title  ArcticEscrow
 * @notice Milestone-based USDC escrow with optional ERC-4626 yield accrual on Arc.
 *
 * Deals contain:
 *   - Up to 20 milestones, each with an Approval or Schedule release rule.
 *   - Up to 10 split recipients whose bps must sum to exactly 10 000.
 *   - An optional earnYield flag that deposits the whole principal into a
 *     configured ERC-4626 vault (e.g. a Morpho vault) while the deal is active.
 *
 * Fees:
 *   - feeBps     (snapshotted per deal) taken from principal on each release.
 *   - yieldFeeBps (snapshotted per deal) taken from realized yield on release/refund.
 *   Both are set at creation time so that later admin changes never affect live deals.
 *
 * Pull-based split payments: each split share is pushed via a low-level call; on
 * failure the share is rerouted to the payer and SplitFailed is emitted, so a
 * blocked recipient never bricks milestone completion.
 *
 * Liveness: both the payer AND the payee may call refundMilestone.  The payer may
 * only refund milestones still in the Pending state (before the payee marks delivered);
 * the payee may refund Pending or Delivered milestones.  This guarantees that payer
 * funds cannot be locked by an inactive counterparty.
 */
contract ArcticEscrow is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    enum DealStatus      { Funded, InProgress, Completed }
    enum MilestoneRule   { Approval, Schedule }
    enum MilestoneState  { Pending, Delivered, Released, Refunded }

    struct Milestone {
        uint128        amount;
        uint128        releaseTime;   // 0 for Approval milestones
        MilestoneRule  rule;
        MilestoneState state;
        uint128        releasedAt;
    }

    struct Split {
        address recipient;
        uint16  bps;
    }

    /// @dev Fees are snapshotted at deal creation so admin changes don't affect live deals.
    struct Deal {
        address    payer;
        address    payee;
        uint128    total;
        uint128    released;
        uint128    principalRemaining;
        uint256    shares;            // vault shares held; 0 when earnYield=false
        bool       earnYield;
        uint64     createdAt;
        uint16     feeBps;            // snapshotted at creation
        uint16     yieldFeeBps;       // snapshotted at creation
        DealStatus status;
    }

    struct MilestoneInput {
        string         title;        // 1..80 bytes UTF-8; stored in _milestoneTitles
        uint128        amount;
        MilestoneRule  rule;
        uint128        releaseTime;  // required when rule == Schedule; ignored otherwise
    }

    struct SplitInput {
        address recipient;
        uint16  bps;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error InvalidFee();
    error InvalidTitle();
    error InvalidMilestones();
    error InvalidSplits();
    error InvalidAmount();
    error InvalidReleaseTime(uint256 dealId, uint256 index);
    error NoVault();
    error PayeeEqualsPayer();
    error NotPayer();
    error NotPayee();
    error NotReleasable(uint256 dealId, uint256 index);
    error DealNotFound(uint256 dealId);
    error DealCompleted(uint256 dealId);
    error VaultAssetMismatch();

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Title emitted here; on-chain storage holds only keccak256(title) for verification.
    event DealCreated(
        uint256 indexed dealId,
        address indexed payer,
        address indexed payee,
        string          title,
        uint128         total,
        bool            earnYield
    );
    event MilestoneDelivered(uint256 indexed dealId, uint256 index);
    event MilestoneReleased(
        uint256 indexed dealId,
        uint256         index,
        uint128         gross,
        uint128         fee
    );
    event SplitPaid(
        uint256 indexed dealId,
        uint256         milestoneIndex,
        address indexed recipient,
        uint128         amount
    );
    /// @dev Emitted when a split transfer fails; share rerouted to payer.
    event SplitFailed(
        uint256 indexed dealId,
        uint256         milestoneIndex,
        address indexed recipient,
        uint128         amount
    );
    event YieldHarvested(
        uint256 indexed dealId,
        uint256         index,
        uint128         toPayer,
        uint128         fee,
        uint128         shortfall
    );
    event MilestoneRefunded(uint256 indexed dealId, uint256 index, uint128 amount);
    event FeeBpsUpdated(uint16 bps);
    event YieldFeeBpsUpdated(uint16 bps);
    event TreasuryUpdated(address treasury);

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    IERC20  public immutable usdc;
    IERC4626 public immutable vault;
    address  public treasury;
    uint16   public feeBps;
    uint16   public yieldFeeBps;
    uint256  public dealCount;

    mapping(uint256 => Deal)       private _deals;
    /// @dev Titles stored separately; they are immutable after creation.
    mapping(uint256 => bytes32)    private _dealTitleHashes;
    mapping(uint256 => Milestone[]) private _milestones;
    mapping(uint256 => mapping(uint256 => bytes32)) private _milestoneTitleHashes;
    mapping(uint256 => Split[])    private _splits;
    mapping(address => uint256[])  private _dealsByPayer;
    mapping(address => uint256[])  private _dealsByPayee;

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param _usdc       USDC ERC-20 token address.
     * @param _vault      ERC-4626 vault address; pass address(0) to disable yield mode.
     * @param _treasury   Fee recipient; must be non-zero.
     * @param _feeBps     Protocol principal fee in bps (max 100 = 1 %).
     * @param _yieldFeeBps Yield fee in bps (max 2000 = 20 %).
     */
    constructor(
        address _usdc,
        address _vault,
        address _treasury,
        uint16  _feeBps,
        uint16  _yieldFeeBps
    ) Ownable(msg.sender) {
        if (_usdc == address(0) || _treasury == address(0)) revert ZeroAddress();
        if (_usdc.code.length == 0) revert ZeroAddress(); // must be a deployed contract
        if (_feeBps > 100 || _yieldFeeBps > 2000) revert InvalidFee();

        // Validate vault has USDC as its underlying asset
        if (_vault != address(0)) {
            if (IERC4626(_vault).asset() != _usdc) revert VaultAssetMismatch();
        }

        usdc       = IERC20(_usdc);
        vault      = IERC4626(_vault);
        treasury   = _treasury;
        feeBps     = _feeBps;
        yieldFeeBps = _yieldFeeBps;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // createDeal
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Create and fund a new escrow deal.
     * @param payee        Payee wallet; may not equal msg.sender or address(0).
     * @param title        Deal title, 1-80 bytes.
     * @param milestonesIn Milestone definitions.
     * @param splitsIn     Payout recipients and shares (bps must sum to 10 000).
     * @param earnYield    Deposit principal into vault for yield accrual.
     * @return dealId      Newly created deal id.
     */
    function createDeal(
        address                   payee,
        string           calldata title,
        MilestoneInput[] calldata milestonesIn,
        SplitInput[]     calldata splitsIn,
        bool                      earnYield
    ) external nonReentrant whenNotPaused returns (uint256 dealId) {
        if (payee == address(0)) revert ZeroAddress();
        if (payee == msg.sender) revert PayeeEqualsPayer();
        {
            uint256 len = bytes(title).length;
            if (len == 0 || len > 80) revert InvalidTitle();
        }

        uint256 total = _validateInputs(milestonesIn, splitsIn, earnYield);

        dealId = dealCount++;

        // Fund and write deal record
        uint256 shares = _fund(total, earnYield);
        _writeDeal(dealId, payee, title, total, shares, earnYield);
        _writeMilestones(dealId, milestonesIn);
        _writeSplits(dealId, splitsIn);

        _dealsByPayer[msg.sender].push(dealId);
        _dealsByPayee[payee].push(dealId);

        emit DealCreated(dealId, msg.sender, payee, title, uint128(total), earnYield);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // markDelivered
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Payee marks an Approval-rule milestone as delivered.
     */
    function markDelivered(uint256 dealId, uint256 index) external {
        Deal storage deal = _deals[dealId];
        if (deal.payer == address(0)) revert DealNotFound(dealId);
        if (deal.status == DealStatus.Completed) revert DealCompleted(dealId);
        if (msg.sender != deal.payee) revert NotPayee();

        Milestone storage ms = _milestones[dealId][index];
        if (ms.rule != MilestoneRule.Approval || ms.state != MilestoneState.Pending) {
            revert NotReleasable(dealId, index);
        }
        ms.state = MilestoneState.Delivered;
        emit MilestoneDelivered(dealId, index);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // releaseMilestone
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Release a milestone and distribute payout.
     *   Approval rule: payer only, milestone must be in Delivered state.
     *   Schedule rule: anyone, once block.timestamp >= releaseTime.
     */
    function releaseMilestone(uint256 dealId, uint256 index) external nonReentrant {
        Deal storage deal = _deals[dealId];
        if (deal.payer == address(0)) revert DealNotFound(dealId);
        if (deal.status == DealStatus.Completed) revert DealCompleted(dealId);

        Milestone storage ms = _milestones[dealId][index];

        if (ms.rule == MilestoneRule.Approval) {
            if (msg.sender != deal.payer || ms.state != MilestoneState.Delivered) {
                revert NotReleasable(dealId, index);
            }
        } else {
            if (block.timestamp < ms.releaseTime) revert NotReleasable(dealId, index);
            if (ms.state != MilestoneState.Pending && ms.state != MilestoneState.Delivered) {
                revert NotReleasable(dealId, index);
            }
        }

        uint256 principal = ms.amount;
        bool    yieldOn   = deal.earnYield && address(vault) != address(0);

        uint256 effectivePrincipal = 0;
        uint256 yieldAmount        = 0;
        uint256 shortfall          = 0;

        if (yieldOn) {
            uint256 sharesToBurn = (deal.shares * principal) / deal.principalRemaining;
            deal.shares            -= sharesToBurn;
            deal.principalRemaining -= ms.amount;

            uint256 redeemed = vault.redeem(sharesToBurn, address(this), address(this));
            if (redeemed >= principal) {
                yieldAmount        = redeemed - principal;
                effectivePrincipal = principal;
            } else {
                shortfall          = principal - redeemed;
                effectivePrincipal = redeemed;
            }
        } else {
            deal.principalRemaining -= ms.amount;
            effectivePrincipal = principal;
        }

        uint256 feeAmount = (effectivePrincipal * deal.feeBps) / 10_000;
        uint256 net       = effectivePrincipal - feeAmount;

        // Effects
        deal.released = uint128(uint256(deal.released) + effectivePrincipal);
        ms.state      = MilestoneState.Released;
        ms.releasedAt = uint128(block.timestamp);
        if (_allDone(dealId)) deal.status = DealStatus.Completed;
        else deal.status = DealStatus.InProgress;

        emit MilestoneReleased(dealId, index, uint128(effectivePrincipal), uint128(feeAmount));

        // Interactions
        if (feeAmount > 0) usdc.safeTransfer(treasury, feeAmount);
        _distributeSplits(dealId, index, net, deal.payer);
        _settleYield(dealId, index, deal.payer, yieldAmount, shortfall, deal.yieldFeeBps);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // refundMilestone
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Refund a milestone to the payer.
     *   Payee may refund Pending or Delivered milestones.
     *   Payer may refund Pending milestones (liveness escape hatch when payee is unresponsive).
     *   Principal + net yield (minus yield fee) is returned to payer.
     */
    function refundMilestone(uint256 dealId, uint256 index) external nonReentrant {
        Deal storage deal = _deals[dealId];
        if (deal.payer == address(0)) revert DealNotFound(dealId);
        if (deal.status == DealStatus.Completed) revert DealCompleted(dealId);

        Milestone storage ms = _milestones[dealId][index];
        bool isPayer = msg.sender == deal.payer;
        bool isPayee = msg.sender == deal.payee;

        if (!isPayee && !isPayer) revert NotPayee();

        // Payer can only refund Pending milestones (before delivery is confirmed)
        if (isPayer && !isPayee) {
            if (ms.state != MilestoneState.Pending) revert NotReleasable(dealId, index);
        } else {
            // Payee can refund Pending or Delivered
            if (ms.state != MilestoneState.Pending && ms.state != MilestoneState.Delivered) {
                revert NotReleasable(dealId, index);
            }
        }

        uint256 principal  = ms.amount;
        bool    yieldOn    = deal.earnYield && address(vault) != address(0);
        uint256 returnAmt   = 0;
        uint256 yieldFeeAmt = 0;

        if (yieldOn) {
            uint256 sharesToBurn = (deal.shares * principal) / deal.principalRemaining;
            deal.shares            -= sharesToBurn;
            deal.principalRemaining -= ms.amount;

            uint256 redeemed   = vault.redeem(sharesToBurn, address(this), address(this));
            uint256 yieldAmt   = redeemed > principal ? redeemed - principal : 0;
            uint256 baseReturn = redeemed < principal ? redeemed : principal;
            yieldFeeAmt        = (yieldAmt * deal.yieldFeeBps) / 10_000;
            returnAmt          = baseReturn + (yieldAmt - yieldFeeAmt);
        } else {
            deal.principalRemaining -= ms.amount;
            returnAmt = principal;
        }

        // Effects
        ms.state = MilestoneState.Refunded;
        if (_allDone(dealId)) deal.status = DealStatus.Completed;
        else deal.status = DealStatus.InProgress;

        // Interactions
        if (yieldFeeAmt > 0) usdc.safeTransfer(treasury, yieldFeeAmt);
        if (returnAmt   > 0) usdc.safeTransfer(deal.payer, returnAmt);

        emit MilestoneRefunded(dealId, index, ms.amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Set global protocol principal fee (applies to new deals only).
    function setFeeBps(uint16 bps) external onlyOwner {
        if (bps > 100) revert InvalidFee();
        feeBps = bps;
        emit FeeBpsUpdated(bps);
    }

    /// @notice Set global yield fee (applies to new deals only).
    function setYieldFeeBps(uint16 bps) external onlyOwner {
        if (bps > 2000) revert InvalidFee();
        yieldFeeBps = bps;
        emit YieldFeeBpsUpdated(bps);
    }

    /// @notice Set treasury address.
    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasuryUpdated(t);
    }

    /// @notice Pause new deal creation only.
    function pause() external onlyOwner   { _pause(); }

    /// @notice Unpause deal creation.
    function unpause() external onlyOwner { _unpause(); }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return _deals[dealId];
    }

    function getMilestones(uint256 dealId) external view returns (Milestone[] memory) {
        return _milestones[dealId];
    }

    function getMilestoneTitle(uint256 dealId, uint256 index) external view returns (bytes32) {
        return _milestoneTitleHashes[dealId][index];
    }

    function getDealTitleHash(uint256 dealId) external view returns (bytes32) {
        return _dealTitleHashes[dealId];
    }

    function getSplits(uint256 dealId) external view returns (Split[] memory) {
        return _splits[dealId];
    }

    function dealsByPayer(address payer) external view returns (uint256[] memory) {
        return _dealsByPayer[payer];
    }

    function dealsByPayee(address payee) external view returns (uint256[] memory) {
        return _dealsByPayee[payee];
    }

    /**
     * @notice Return pending unrealized yield for a deal (floored at 0).
     */
    function pendingYield(uint256 dealId) external view returns (uint256) {
        Deal storage deal = _deals[dealId];
        if (!deal.earnYield || address(vault) == address(0) || deal.shares == 0) return 0;
        uint256 assets = vault.convertToAssets(deal.shares);
        return assets > deal.principalRemaining ? assets - deal.principalRemaining : 0;
    }

    function vaultAddress() external view returns (address) {
        return address(vault);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _validateInputs(
        MilestoneInput[] calldata milestonesIn,
        SplitInput[]     calldata splitsIn,
        bool                      earnYield
    ) internal view returns (uint256 total) {
        uint256 mLen = milestonesIn.length;
        if (mLen == 0 || mLen > 20) revert InvalidMilestones();
        uint256 sLen = splitsIn.length;
        if (sLen == 0 || sLen > 10) revert InvalidSplits();
        if (earnYield && address(vault) == address(0)) revert NoVault();

        for (uint256 i; i < mLen; ++i) {
            MilestoneInput calldata m = milestonesIn[i];
            { uint256 tl = bytes(m.title).length; if (tl == 0 || tl > 80) revert InvalidTitle(); }
            if (m.amount == 0) revert InvalidAmount();
            if (m.rule == MilestoneRule.Schedule && m.releaseTime <= block.timestamp) {
                revert InvalidReleaseTime(0, i);
            }
            total += m.amount;
        }
        if (total == 0 || total > type(uint128).max) revert InvalidAmount();

        uint256 bpsSum = 0;
        for (uint256 i; i < sLen; ++i) {
            if (splitsIn[i].recipient == address(0)) revert InvalidSplits();
            bpsSum += splitsIn[i].bps;
        }
        if (bpsSum != 10_000) revert InvalidSplits();
    }

    function _fund(uint256 total, bool earnYield) internal returns (uint256 shares) {
        usdc.safeTransferFrom(msg.sender, address(this), total);
        if (earnYield && address(vault) != address(0)) {
            usdc.forceApprove(address(vault), total);
            shares = vault.deposit(total, address(this));
            usdc.forceApprove(address(vault), 0);
        }
    }

    function _writeDeal(
        uint256          dealId,
        address          payee,
        string  calldata title,
        uint256          total,
        uint256          shares,
        bool             earnYield
    ) internal {
        Deal storage d  = _deals[dealId];
        d.payer              = msg.sender;
        d.payee              = payee;
        d.total              = uint128(total);
        d.principalRemaining = uint128(total);
        d.shares             = shares;
        d.earnYield          = earnYield;
        d.createdAt          = uint64(block.timestamp);
        d.feeBps             = feeBps;
        d.yieldFeeBps        = yieldFeeBps;
        d.status             = DealStatus.Funded;
        _dealTitleHashes[dealId] = keccak256(bytes(title));
    }

    function _writeMilestones(uint256 dealId, MilestoneInput[] calldata ms) internal {
        uint256 len = ms.length;
        for (uint256 i; i < len; ++i) {
            MilestoneInput calldata m = ms[i];
            _milestones[dealId].push(Milestone({
                amount:      m.amount,
                releaseTime: m.rule == MilestoneRule.Schedule ? m.releaseTime : 0,
                rule:        m.rule,
                state:       MilestoneState.Pending,
                releasedAt:  0
            }));
            _milestoneTitleHashes[dealId][i] = keccak256(bytes(m.title));
        }
    }

    function _writeSplits(uint256 dealId, SplitInput[] calldata ss) internal {
        uint256 len = ss.length;
        for (uint256 i; i < len; ++i) {
            _splits[dealId].push(Split({recipient: ss[i].recipient, bps: ss[i].bps}));
        }
    }

    /**
     * @dev Push-based split with per-recipient fallback to payer on failure.
     *      A blocked recipient (e.g. contract that reverts on receive) cannot brick
     *      milestone completion — their share is re-routed to the payer instead.
     */
    function _distributeSplits(
        uint256 dealId,
        uint256 milestoneIdx,
        uint256 net,
        address payer
    ) internal {
        Split[] storage ss = _splits[dealId];
        uint256 len = ss.length;
        uint256 accum = 0;
        for (uint256 i; i + 1 < len; ++i) {
            uint256 share = (net * ss[i].bps) / 10_000;
            accum += share;
            _sendOrFallback(dealId, milestoneIdx, ss[i].recipient, share, payer);
        }
        uint256 lastShare = net - accum;
        _sendOrFallback(dealId, milestoneIdx, ss[len - 1].recipient, lastShare, payer);
    }

    function _sendOrFallback(
        uint256 dealId,
        uint256 milestoneIdx,
        address recipient,
        uint256 amount,
        address payer
    ) internal {
        if (amount == 0) return;
        bytes memory data = abi.encodeCall(IERC20.transfer, (recipient, amount));
        (bool ok, bytes memory ret) = address(usdc).call(data);
        bool success = ok && (ret.length == 0 || abi.decode(ret, (bool)));
        if (success) {
            emit SplitPaid(dealId, milestoneIdx, recipient, uint128(amount));
        } else {
            // Reroute to payer and record failure
            usdc.safeTransfer(payer, amount);
            emit SplitFailed(dealId, milestoneIdx, recipient, uint128(amount));
        }
    }

    function _settleYield(
        uint256 dealId,
        uint256 milestoneIdx,
        address payer,
        uint256 yieldAmount,
        uint256 shortfall,
        uint256 yfBps
    ) internal {
        if (yieldAmount > 0) {
            uint256 yieldFee = (yieldAmount * yfBps) / 10_000;
            uint256 yieldNet = yieldAmount - yieldFee;
            if (yieldFee > 0) usdc.safeTransfer(treasury, yieldFee);
            if (yieldNet > 0) usdc.safeTransfer(payer, yieldNet);
            emit YieldHarvested(dealId, milestoneIdx, uint128(yieldNet), uint128(yieldFee), 0);
        } else if (shortfall > 0) {
            emit YieldHarvested(dealId, milestoneIdx, 0, 0, uint128(shortfall));
        }
    }

    function _allDone(uint256 dealId) internal view returns (bool) {
        Milestone[] storage ms = _milestones[dealId];
        uint256 len = ms.length;
        for (uint256 i; i < len; ++i) {
            MilestoneState s = ms[i].state;
            if (s != MilestoneState.Released && s != MilestoneState.Refunded) return false;
        }
        return true;
    }
}
