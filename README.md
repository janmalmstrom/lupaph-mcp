# LupaPH MCP Server

Philippine real estate data for AI agents — search verified listings, calculate transfer costs, and get accurate legal information via [lupaph.com](https://lupaph.com).

## Tools

| Tool | What it does |
|---|---|
| `search_listings` | Search verified PH property listings by province, type, price |
| `get_listing` | Full details of a specific listing |
| `get_province_listings_summary` | Overview of available listings in a province |
| `calculate_transfer_cost` | Full title transfer cost breakdown (CGT, DST, transfer tax, registration) |
| `get_legal_info` | Accurate PH real estate legal rules (ownership, CARP, SPA, title verification) |
| `search_guides` | Search lupaph.com buying guides and articles |

## Install

### Claude Desktop / Claude Code

Add to your MCP config:

```json
{
  "mcpServers": {
    "lupaph": {
      "command": "npx",
      "args": ["-y", "lupaph-mcp"]
    }
  }
}
```

**Claude Desktop config location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Claude Code:**
```bash
claude mcp add lupaph -- npx -y lupaph-mcp
```

### Manual install

```bash
npm install -g lupaph-mcp
lupaph-mcp
```

## Example prompts

```
Find farm lots under ₱1,000,000 in Batangas
```
```
Calculate transfer costs for a ₱3,500,000 property in a province
```
```
What are the CARP rules for buying agricultural land in the Philippines?
```
```
Can an OFW buy land in the Philippines without going home?
```
```
Show me beach properties available in Palawan
```
```
What documents do I need to verify a land title in the Philippines?
```

## Legal topics available

- `ownership_rights` — Who can own land (OFWs, dual citizens, foreigners)
- `title_verification` — TCT vs Tax Declaration, Registry of Deeds, encumbrances
- `transfer_costs` — CGT, DST, transfer tax breakdown
- `carp_agricultural` — CARP rules, DAR clearance, tenant rights, conversion
- `spa_remote_buying` — Special Power of Attorney, apostille, consularisation
- `financing` — Pag-IBIG, bank loans, developer financing
- `deceased_owner` — Estate settlement, extrajudicial settlement
- `brokers_lawyers` — When you need each, how to verify a PRC licence

## Data source

All listing data is live from [lupaph.com](https://lupaph.com) — verified lots, farm land, beach properties, and bank foreclosures across all 83 Philippine provinces.

## License

MIT
