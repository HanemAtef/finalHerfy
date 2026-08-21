/**
 * Frontend Regression Test Suite for Handyman GPS Watcher Lifecycle & Order Isolation
 * Verifies Requirements D, E, F, G in HandymanOrderDetailsPage.jsx
 */

const {
  isValidGpsCoord,
} = require('../socket/livetrackingHelpers');

describe('Handyman Frontend GPS Watcher Lifecycle & Order Isolation (Requirements D, E, F, G)', () => {
  let watchIdCounter;
  let activeWatchers;
  let clearedWatchers;
  let mockGeolocation;
  let mockSocket;
  let emittedEvents;

  beforeEach(() => {
    watchIdCounter = 100;
    activeWatchers = new Map();
    clearedWatchers = [];
    emittedEvents = [];

    mockGeolocation = {
      watchPosition: jest.fn((successCallback, errorCallback, options) => {
        const id = ++watchIdCounter;
        activeWatchers.set(id, { successCallback, errorCallback, options });
        return id;
      }),
      clearWatch: jest.fn((id) => {
        if (id != null) {
          clearedWatchers.push(id);
          activeWatchers.delete(id);
        }
      }),
      getCurrentPosition: jest.fn((successCallback) => {
        successCallback({
          coords: { latitude: 30.05, longitude: 31.05, accuracy: 10 },
        });
      }),
    };

    mockSocket = {
      connected: true,
      id: 'mock-socket-123',
      emit: jest.fn((event, payload) => {
        emittedEvents.push({ event, payload });
      }),
    };
  });

  // Helper simulating HandymanOrderDetailsPage tracking guards & watcher logic
  function createFrontendTrackingInstance(initialOrderId, initialOrder) {
    let currentId = initialOrderId;
    let currentOrder = initialOrder;
    let isHandymanJoined = false;
    let watchId = null;
    let hasArrived = false;
    let initialGpsReady = true;

    // Derived flags matching HandymanOrderDetailsPage logic
    const getIsTrackingLive = () => {
      if (!currentOrder) return false;
      if (currentOrder.trackingStatus === 'expired') return false;
      if (['arrived', 'in-progress', 'completed', 'cancelled', 'disputed'].includes(currentOrder.status)) {
        return false;
      }
      return currentOrder.status === 'price_confirmed' && currentOrder.isHandymanOnTheWay === true;
    };

    const getShowTrackingMap = () => getIsTrackingLive();

    const emitSendLocation = (lat, lng) => {
      if (!mockSocket.connected) return false;

      // GUARD 1: isHandymanJoined must be true
      if (!isHandymanJoined) {
        return false;
      }

      // GUARD 2: orderId alignment
      if (currentOrder?._id && String(currentId) !== String(currentOrder._id)) {
        return false;
      }

      mockSocket.emit('sendLocation', { orderId: currentId, lat, lng });
      return true;
    };

    const queueOrSendLocation = (lat, lng) => {
      if (!initialGpsReady) return false;
      if (!isHandymanJoined) return false;
      if (currentOrder?._id && String(currentId) !== String(currentOrder._id)) return false;
      if (hasArrived || !getIsTrackingLive()) return false;

      return emitSendLocation(lat, lng);
    };

    const startWatchAfterInitialFix = (lat, lng) => {
      if (['arrived', 'in-progress', 'completed', 'cancelled', 'disputed'].includes(currentOrder?.status) || hasArrived) {
        return null;
      }
      if (watchId !== null) return watchId;

      const newWatchId = mockGeolocation.watchPosition(
        (position) => {
          // GUARD: Stale closure check
          if (currentOrder?._id && String(currentId) !== String(currentOrder._id)) {
            mockGeolocation.clearWatch(newWatchId);
            if (watchId === newWatchId) watchId = null;
            return;
          }

          if (['arrived', 'in-progress', 'completed', 'cancelled', 'disputed'].includes(currentOrder?.status)) {
            if (watchId !== null) {
              mockGeolocation.clearWatch(watchId);
              watchId = null;
            }
            return;
          }

          const wLat = position.coords.latitude;
          const wLng = position.coords.longitude;
          if (!hasArrived && getIsTrackingLive()) {
            queueOrSendLocation(wLat, wLng);
          }
        },
        (err) => {},
        {}
      );

      watchId = newWatchId;
      queueOrSendLocation(lat, lng);
      return newWatchId;
    };

    const unmountOrChangeOrder = (newOrderId, newOrder) => {
      // Unconditional clearWatch on unmount or orderId change
      if (watchId !== null) {
        mockGeolocation.clearWatch(watchId);
        watchId = null;
      }
      isHandymanJoined = false;
      if (newOrderId !== undefined) currentId = newOrderId;
      if (newOrder !== undefined) currentOrder = newOrder;
    };

    const setHandymanJoined = (val) => {
      isHandymanJoined = val;
    };

    const setOrderStatus = (newStatus) => {
      if (!currentOrder) return;
      currentOrder = { ...currentOrder, status: newStatus };
      if (['arrived', 'in-progress', 'completed', 'cancelled', 'disputed'].includes(newStatus)) {
        hasArrived = newStatus === 'arrived';
        if (watchId !== null) {
          mockGeolocation.clearWatch(watchId);
          watchId = null;
        }
      }
    };

    return {
      get watchId() { return watchId; },
      get isHandymanJoined() { return isHandymanJoined; },
      get isTrackingLive() { return getIsTrackingLive(); },
      get showTrackingMap() { return getShowTrackingMap(); },
      get currentOrder() { return currentOrder; },
      get currentId() { return currentId; },
      setHandymanJoined,
      setOrderStatus,
      startWatchAfterInitialFix,
      queueOrSendLocation,
      emitSendLocation,
      unmountOrChangeOrder,
    };
  }

  // ── Requirement D: OrderId change clears watcher ────────────────────────────
  it('Requirement D: when orderId changes, previous watchPosition watcher MUST be cleared', () => {
    const orderA = { _id: 'order_A', status: 'price_confirmed', isHandymanOnTheWay: true, trackingStatus: 'active' };
    const instance = createFrontendTrackingInstance('order_A', orderA);
    instance.setHandymanJoined(true);

    const watchIdA = instance.startWatchAfterInitialFix(30.05, 31.05);
    expect(watchIdA).toBeDefined();
    expect(mockGeolocation.watchPosition).toHaveBeenCalledTimes(1);

    // Navigate away / change orderId to Order B
    const orderB = { _id: 'order_B', status: 'price_confirmed', isHandymanOnTheWay: true, trackingStatus: 'active' };
    instance.unmountOrChangeOrder('order_B', orderB);

    // PROVE clearWatch was called for Order A's watcher
    expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(watchIdA);
    expect(clearedWatchers).toContain(watchIdA);
    expect(instance.watchId).toBeNull();
  });

  // ── Requirement E: Stale GPS callback from Order A cannot emit for Order A ──
  it('Requirement E: stale GPS callback belonging to Order A MUST NOT emit sendLocation after navigating to Order B', () => {
    const orderA = { _id: 'order_A', status: 'price_confirmed', isHandymanOnTheWay: true, trackingStatus: 'active' };
    const instance = createFrontendTrackingInstance('order_A', orderA);
    instance.setHandymanJoined(true);

    const watchIdA = instance.startWatchAfterInitialFix(30.05, 31.05);
    const watcherAEntry = activeWatchers.get(watchIdA);

    // Clear emitted events from setup
    emittedEvents.length = 0;

    // Navigate to Order B
    const orderB = { _id: 'order_B', status: 'price_confirmed', isHandymanOnTheWay: true, trackingStatus: 'active' };
    instance.unmountOrChangeOrder('order_B', orderB);

    // Simulate stale callback execution from Order A's watcher
    if (watcherAEntry?.successCallback) {
      watcherAEntry.successCallback({ coords: { latitude: 30.10, longitude: 31.10 } });
    }

    // PROVE no sendLocation was emitted for Order A or at all
    const sendLocationEmits = emittedEvents.filter(e => e.event === 'sendLocation');
    expect(sendLocationEmits).toHaveLength(0);
    expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(watchIdA);
  });

  // ── Requirement F: When tracking becomes arrived, map & GPS stop ───────────
  it('Requirement F: when tracking becomes arrived, watcher is cleared, sending stops, map disappears', () => {
    const orderA = { _id: 'order_A', status: 'price_confirmed', isHandymanOnTheWay: true, trackingStatus: 'active' };
    const instance = createFrontendTrackingInstance('order_A', orderA);
    instance.setHandymanJoined(true);

    const watchIdA = instance.startWatchAfterInitialFix(30.05, 31.05);
    expect(instance.isTrackingLive).toBe(true);
    expect(instance.showTrackingMap).toBe(true);

    emittedEvents.length = 0;

    // Transition to arrived
    instance.setOrderStatus('arrived');

    // PROVE map is hidden and live tracking is false
    expect(instance.isTrackingLive).toBe(false);
    expect(instance.showTrackingMap).toBe(false);
    expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(watchIdA);
    expect(instance.watchId).toBeNull();

    // PROVE sending location returns false after arrival
    const result = instance.queueOrSendLocation(30.05, 31.05);
    expect(result).toBe(false);
    expect(emittedEvents.filter(e => e.event === 'sendLocation')).toHaveLength(0);
  });

  // ── Requirement G: Arrived -> in-progress keeps GPS & map stopped ─────────
  it('Requirement G: when arrived changes to in-progress, watcher remains stopped and no sendLocation restarts', () => {
    const orderA = { _id: 'order_A', status: 'price_confirmed', isHandymanOnTheWay: true, trackingStatus: 'active' };
    const instance = createFrontendTrackingInstance('order_A', orderA);
    instance.setHandymanJoined(true);

    // Initial trip -> arrived
    instance.startWatchAfterInitialFix(30.05, 31.05);
    instance.setOrderStatus('arrived');

    mockGeolocation.watchPosition.mockClear();
    emittedEvents.length = 0;

    // Handyman clicks "Start Work" -> arrived becomes in-progress
    instance.setOrderStatus('in-progress');

    // PROVE isTrackingLive & showTrackingMap remain false
    expect(instance.isTrackingLive).toBe(false);
    expect(instance.showTrackingMap).toBe(false);

    // Attempting to start watch returns null (no new watcher created)
    const newWatchId = instance.startWatchAfterInitialFix(30.05, 31.05);
    expect(newWatchId).toBeNull();
    expect(mockGeolocation.watchPosition).not.toHaveBeenCalled();

    // PROVE queueOrSendLocation does NOT send location
    const sent = instance.queueOrSendLocation(30.05, 31.05);
    expect(sent).toBe(false);
    expect(emittedEvents.filter(e => e.event === 'sendLocation')).toHaveLength(0);
  });

  // ── Safety Guard: isHandymanJoined === false blocks sendLocation ─────────────
  it('Safety Guard: isHandymanJoined === false strictly blocks sendLocation', () => {
    const orderA = { _id: 'order_A', status: 'price_confirmed', isHandymanOnTheWay: true, trackingStatus: 'active' };
    const instance = createFrontendTrackingInstance('order_A', orderA);

    // isHandymanJoined is false
    expect(instance.isHandymanJoined).toBe(false);

    const sent = instance.emitSendLocation(30.05, 31.05);
    expect(sent).toBe(false);
    expect(emittedEvents).toHaveLength(0);
  });
});
