import assert from 'node:assert/strict';

/** Test the SDK's actual admission boundary before using its internal dispatcher. */
export function assertTransportAdmission(connection, sdk, setAuthenticated) {
  const request = { headers: new Headers({ Host: '127.0.0.1' }) };
  setAuthenticated(false);
  assert.equal(connection.requestRejection(request), 401);
  assert.equal(connection.admit(request).rejection, 401);
  setAuthenticated(true);
  assert.equal(connection.requestRejection({ headers: new Headers({ Host: 'foreign.invalid' }) }), 403);
  assert.equal(connection.requestRejection(request), undefined);
  const { peer } = connection.admit(request); assert.ok(peer);
  // Official rc020 exposes one admitted operator, without per-peer principals.
  // Newer SDKs expose browserPeer and additionally fence each exact Fetch route.
  const legacyOperator = sdk === '0.2.0-rc.2';
  if (legacyOperator) {
    assert.equal(peer, connection.operator);
    assert.equal(connection.browserPeer, undefined);
  } else {
    assert.equal(peer, connection.browserPeer);
    assert.equal(peer.principal.kind, 'owner');
    assert.equal(connection.operator, undefined);
  }
  return { peer, legacyOperator, unauthenticatedRequest: 401, foreignAuthority: 403 };
}
