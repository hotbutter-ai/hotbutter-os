# Voice Chat Skill (Open Source)

Self-contained voice chat skill that embeds the Hotbutter relay server and PWA locally.

For the hosted version, visit [hotbutter.ai](https://hotbutter.ai). Follow [@DnuLkjkjh](https://x.com/DnuLkjkjh) for updates.

## How It Works

1. The skill starts an embedded relay server with the PWA on a local port
2. It connects as an agent to its own relay server
3. A 6-digit pairing code and clickable URL are printed to the terminal
4. Opening the URL auto-pairs and starts a voice session
5. Speech-to-text in the browser converts voice to text, sent to the agent via the relay
6. Agent responses are sent back through the relay and spoken aloud via browser TTS

## Usage

```bash
# Start the voice bridge (embedded relay on port 3000)
voice-bridge start

# Start on a custom port
voice-bridge start --port 4000

# Start with a custom agent display name
voice-bridge start --agent-name "Basil AI"
```

## Message Flow

```
User speaks → Browser STT → WebSocket → Embedded Relay → Skill → openclaw agent
Agent responds → Skill → Embedded Relay → WebSocket → Browser TTS → User hears
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `--port` | `3000` | Port for the embedded relay + PWA server |
| `--agent-name` | `Agent` | Display name shown to the voice client |
