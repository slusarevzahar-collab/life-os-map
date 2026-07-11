# Claude Design source-parity integration

The exported `LifeMap Home.dc.html` is the visual and motion specification. Production logic remains in the existing React/Notion/LM Inbox/LM Assistant stack.

Implementation rules:

1. Preserve the complete LifeMap data tree and routes.
2. Preserve all existing write actions, LM Inbox behavior and Assistant behavior.
3. Recreate the 1280×800 design coordinate system and scale it to the viewport.
4. Use the supplied `space-bg.jpg` asset.
5. Recreate camera flight, background parallax, twinkle, glow, Mission Control and panel geometry from the source prototype.
6. Do not filter or rename live data merely to match the mock content.
