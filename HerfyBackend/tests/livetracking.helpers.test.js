const {
  isActiveTrackingOrder,
  shouldAllowArrival,
  shouldInvalidateRouteCache,
  shouldRecalculateRoute,
  isRouteCacheValid,
  createTripState,
  applyHandymanTripProgress,
  isGpsEntryFresh,
  ARRIVAL_THRESHOLD_METERS,
  ROUTE_CACHE_TOLERANCE_METERS,
} = require('../socket/livetrackingHelpers');

describe('livetrackingHelpers', () => {
  describe('isActiveTrackingOrder', () => {
    it('requires on-the-way for price_confirmed', () => {
      expect(isActiveTrackingOrder({ status: 'price_confirmed', isHandymanOnTheWay: false })).toBe(false);
      expect(isActiveTrackingOrder({ status: 'price_confirmed', isHandymanOnTheWay: true })).toBe(true);
    });

    it('allows in-progress without on-the-way flag', () => {
      expect(isActiveTrackingOrder({ status: 'in-progress', isHandymanOnTheWay: false })).toBe(true);
    });
  });

  describe('shouldAllowArrival', () => {
    const handyman = { lat: 30.0, lng: 31.0 };
    const customer = { lat: 30.0001, lng: 31.0001 };

    it('blocks co-located start on first update', () => {
      const state = createTripState();
      const direct = 15;
      expect(direct).toBeLessThanOrEqual(ARRIVAL_THRESHOLD_METERS);
      expect(shouldAllowArrival(state, handyman, direct)).toBe(false);
    });

    it('allows after en-route evidence (was farther than threshold)', () => {
      let state = createTripState();
      state = applyHandymanTripProgress(state, handyman, { lat: 30.05, lng: 31.05 });
      expect(state.maxDirectMeters).toBeGreaterThan(ARRIVAL_THRESHOLD_METERS);
      expect(shouldAllowArrival(state, handyman, 20)).toBe(true);
    });

    it('allows after minimum tracking time and multiple updates', () => {
      let state = createTripState();
      const now = Date.now();
      state.firstHandymanFix = { lat: 30.0, lng: 31.0 };
      state.firstFixAt = now - 31000;
      state.handymanUpdateCount = 2;
      state.maxDirectMeters = 10;
      expect(shouldAllowArrival(state, handyman, 10, now)).toBe(true);
    });
  });

  describe('shouldInvalidateRouteCache', () => {
    const cached = {
      destination: { lat: 30.0, lng: 31.0 },
      destinationSource: 'live-gps',
    };

    it('does not invalidate for small customer GPS drift', () => {
      expect(
        shouldInvalidateRouteCache(cached, { lat: 30.0001, lng: 31.0001, source: 'live-gps' })
      ).toBe(false);
    });

    it('invalidates when destination moves beyond tolerance', () => {
      expect(
        shouldInvalidateRouteCache(cached, { lat: 30.01, lng: 31.01, source: 'live-gps' })
      ).toBe(true);
    });

    it('invalidates when destination source changes', () => {
      expect(
        shouldInvalidateRouteCache(cached, { lat: 30.0, lng: 31.0, source: 'order-db' })
      ).toBe(true);
    });
  });

  describe('shouldRecalculateRoute', () => {
    it('recalculates when cache invalid even if throttle not expired', () => {
      expect(shouldRecalculateRoute({ throttleExpired: false, cacheStillValid: false })).toBe(true);
    });

    it('reuses cache when throttle active and cache valid', () => {
      expect(shouldRecalculateRoute({ throttleExpired: false, cacheStillValid: true })).toBe(false);
    });
  });

  describe('isRouteCacheValid', () => {
    const trusted = {
      origin: { lat: 30.0, lng: 31.0 },
      destination: { lat: 30.05, lng: 31.05 },
      destinationSource: 'order-db',
    };

    it('accepts small origin drift', () => {
      expect(
        isRouteCacheValid(
          trusted,
          { lat: 30.0003, lng: 31.0003 },
          { lat: 30.05, lng: 31.05 },
          'order-db'
        )
      ).toBe(true);
    });

    it('rejects large origin drift beyond tolerance', () => {
      expect(
        isRouteCacheValid(
          trusted,
          { lat: 30.01, lng: 31.01 },
          { lat: 30.05, lng: 31.05 },
          'order-db'
        )
      ).toBe(false);
    });
  });

  describe('isGpsEntryFresh', () => {
    it('rejects entries older than max age', () => {
      expect(isGpsEntryFresh({ updatedAt: Date.now() - 130000 })).toBe(false);
      expect(isGpsEntryFresh({ updatedAt: Date.now() - 1000 })).toBe(true);
    });
  });
});
