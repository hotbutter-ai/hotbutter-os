function healthRoute(sessionManager, pairingManager) {
  return (req, res) => {
    res.json({
      status: 'ok',
      activeSessions: sessionManager.activeCount,
      pendingPairings: pairingManager.pending.size,
      uptime: process.uptime(),
    });
  };
}

module.exports = { healthRoute };
