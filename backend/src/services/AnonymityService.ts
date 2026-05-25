/**
 * AnonymityService — enforces minimum k-anonymity on vote results.
 *
 * Individual breakdowns are withheld until at least k votes have been cast
 * for a policy. This prevents de-anonymisation when very few people have voted.
 *
 * Default k = 5. Countries may configure a higher threshold in their
 * country JSON config (e.g. small jurisdictions may use k = 10).
 *
 * When the threshold is not met, the results endpoint returns:
 *   { status: "insufficient_votes", minimumRequired: k, current: n }
 */

export interface TallyResult {
  policyId:  string;
  support:   number;
  oppose:    number;
  abstain:   number;
  total:     number;
  lastBlock: number;
  finalized: boolean;
}

export interface AnonymisedResult {
  policyId:           string;
  status:             "available" | "insufficient_votes";
  minimumRequired?:   number;
  current?:           number;
  tally?:             Omit<TallyResult, "policyId">;
}

export class AnonymityService {
  private readonly defaultK: number;
  private readonly countryThresholds: Map<string, number>;

  constructor(defaultK = 5, countryThresholds: Record<string, number> = {}) {
    this.defaultK          = defaultK;
    this.countryThresholds = new Map(Object.entries(countryThresholds));
  }

  /**
   * Apply k-anonymity filter to a tally result.
   * If total votes < k, suppress the breakdown.
   */
  anonymise(tally: TallyResult, countryCode?: string): AnonymisedResult {
    const k = countryCode
      ? (this.countryThresholds.get(countryCode.toUpperCase()) ?? this.defaultK)
      : this.defaultK;

    if (tally.total < k) {
      return {
        policyId:         tally.policyId,
        status:           "insufficient_votes",
        minimumRequired:  k,
        current:          tally.total,
      };
    }

    return {
      policyId: tally.policyId,
      status:   "available",
      tally: {
        support:   tally.support,
        oppose:    tally.oppose,
        abstain:   tally.abstain,
        total:     tally.total,
        lastBlock: tally.lastBlock,
        finalized: tally.finalized,
      },
    };
  }

  /**
   * Filter a list of tallies, suppressing any below the threshold.
   */
  anonymiseAll(tallies: TallyResult[], countryCode?: string): AnonymisedResult[] {
    return tallies.map((t) => this.anonymise(t, countryCode));
  }
}

export const anonymityService = new AnonymityService(
  parseInt(process.env.ANONYMITY_K ?? "5"),
  {
    // Small jurisdictions with higher thresholds
    NZ: 10,
    IS: 10,
    LU: 10,
  }
);
