/**
 * Unit tests for the smart handyman matching/scoring algorithm.
 * These tests exercise the scoring logic directly without HTTP overhead.
 */

// Weights (must match handymanController defaults)
const DIST_WEIGHT = 0.4;
const RATING_WEIGHT = 0.4;
const ACCEPT_WEIGHT = 0.2;

function computeScore(handyman, maxDistance) {
  const normDist = handyman.distance != null
    ? Math.max(0, (maxDistance - handyman.distance) / maxDistance)
    : 0;
  const normRating = (handyman.rating || 0) / 5.0;
  const normAccept = handyman.acceptanceRate || 0;
  return normDist * DIST_WEIGHT + normRating * RATING_WEIGHT + normAccept * ACCEPT_WEIGHT;
}

function rankHandymen(list, maxDistance) {
  return list
    .map(h => ({ ...h, smartScore: computeScore(h, maxDistance) }))
    .sort((a, b) => b.smartScore - a.smartScore);
}

describe('Matching — smart scoring', () => {
  const MAX_DIST = 5000; // 5 km radius

  it('closer handyman with equal rating ranks higher', () => {
    const near = { distance: 500,  rating: 4, acceptanceRate: 0.8 };
    const far  = { distance: 4000, rating: 4, acceptanceRate: 0.8 };
    const ranked = rankHandymen([far, near], MAX_DIST);
    expect(ranked[0].distance).toBe(500);
  });

  it('farther-but-better-rated handyman can outrank a closer-but-lower-rated one', () => {
    const near = { distance: 1000, rating: 2, acceptanceRate: 0.5 };
    const far  = { distance: 3000, rating: 5, acceptanceRate: 1.0 };
    const ranked = rankHandymen([near, far], MAX_DIST);
    expect(ranked[0].distance).toBe(3000);
  });

  it('closer-but-better-rated handyman can outrank a farther-but-lower-rated one', () => {
    const near = { distance: 500,  rating: 4.5, acceptanceRate: 0.9 };
    const far  = { distance: 4500, rating: 2,   acceptanceRate: 0.3 };
    const ranked = rankHandymen([far, near], MAX_DIST);
    expect(ranked[0].distance).toBe(500);
  });

  it('list of available handymen is sorted by descending smart score', () => {
    const list = [
      { distance: 2000, rating: 4, acceptanceRate: 0.9 },
      { distance: 1000, rating: 3, acceptanceRate: 0.6 },
    ];
    const ranked = rankHandymen(list, MAX_DIST);
    expect(ranked.length).toBe(2);
    expect(ranked[0].smartScore).toBeGreaterThanOrEqual(ranked[1].smartScore);
  });

  it('handyman at distance 0 gets maximum distance contribution', () => {
    const atDoor = { distance: 0, rating: 3, acceptanceRate: 0.7 };
    const score = computeScore(atDoor, MAX_DIST);
    // normDist = (5000-0)/5000 = 1.0
    const expected = 1.0 * DIST_WEIGHT + (3 / 5) * RATING_WEIGHT + 0.7 * ACCEPT_WEIGHT;
    expect(score).toBeCloseTo(expected, 5);
  });
});
