import { updateInboxSignalStatus } from './inboxAssetStore.js';

export function registerInboxRoutes(app, runtime) {
  const { config } = runtime;

  app.patch('/api/life-os/signals/:id', async (req, res) => {
    try {
      const result = await updateInboxSignalStatus({
        notionToken: config.notionToken,
        signalId: req.params.id,
        status: req.body?.status,
        nextAction: req.body?.nextAction || '',
      });
      res.json({ ok: true, result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}
