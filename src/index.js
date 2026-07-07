#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API = 'https://lupaph.com/api';

async function fetchApi(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

// ── Transfer cost calculator (pure math, no API needed) ──────────────────────
function calcTransferCosts(sellingPrice, zonalValue, locationType = 'province') {
  const taxBase = Math.max(sellingPrice, zonalValue || sellingPrice);
  const cgt = taxBase * 0.06;
  const dst = taxBase * 0.015;
  const transferTax = sellingPrice * (locationType === 'city' ? 0.0075 : 0.005);
  const registrationFee = sellingPrice * 0.0025;
  const notarialFee = sellingPrice * 0.015; // midpoint 1-2%
  const total = cgt + dst + transferTax + registrationFee + notarialFee;

  const fmt = (n) => `₱${Math.round(n).toLocaleString()}`;
  return {
    selling_price: fmt(sellingPrice),
    tax_base: fmt(taxBase),
    breakdown: {
      capital_gains_tax: { rate: '6%', amount: fmt(cgt), note: "Technically seller's liability — commonly negotiated" },
      documentary_stamp_tax: { rate: '1.5%', amount: fmt(dst), note: 'Pay at BIR by 5th day of month following notarisation' },
      local_transfer_tax: { rate: locationType === 'city' ? '0.75%' : '0.5%', amount: fmt(transferTax), note: 'Pay at local Treasurer\'s Office' },
      registration_fee: { rate: '~0.25%', amount: fmt(registrationFee), note: 'Pay at Registry of Deeds' },
      notarial_fee: { rate: '1–2% (est. 1.5%)', amount: fmt(notarialFee), note: 'Varies by notary and transaction complexity' },
    },
    total_transfer_costs: fmt(total),
    total_with_purchase: fmt(sellingPrice + total),
    percentage_of_price: `${((total / sellingPrice) * 100).toFixed(1)}%`,
    note: 'If zonal value > selling price, CGT and DST are calculated on the higher zonal value. Agricultural land also requires a DAR clearance before the Registry of Deeds will register the transfer.',
  };
}

// ── Legal knowledge base ──────────────────────────────────────────────────────
const LEGAL_TOPICS = {
  ownership_rights: `
**Who can own land in the Philippines:**
- Filipino citizens (including OFWs with valid PH passport): full ownership, no restrictions
- Dual citizens under RA 9225: same as Filipino citizens
- Former natural-born Filipinos (foreign citizen, no RA 9225): max 1,000 sqm urban residential or 1 hectare rural
- Foreign nationals: CANNOT own land (RA 7042). Can own condo units up to 40% of building.
- Corporations: must be at least 60% Filipino-owned to acquire land

**For OFW buyers:**
- Being abroad does not reduce ownership rights
- Use a Special Power of Attorney (SPA) to sign documents remotely
- SPA must be notarised in host country + apostilled (Apostille Convention countries) or consularised at PH Embassy
`.trim(),

  title_verification: `
**Title types:**
- TCT (Transfer Certificate of Title): primary proof of ownership for subdivided land
- OCT (Original Certificate of Title): for land being titled for the first time
- Tax Declaration: NOT proof of ownership — only a tax record. Never buy based on Tax Declaration alone.

**How to verify:**
- Request a Certified True Copy (CTC) from the Registry of Deeds (RD) in the city/municipality where land is located
- LRA Anywhere-to-Anywhere (A2A) service: request from any computerised RD branch nationwide

**Memorandum of Encumbrances (back of title):**
- Real Estate Mortgage (REM): land is loan collateral — must be cleared before purchase
- Adverse Claim: third party asserting competing ownership right
- Notice of Lis Pendens: active court case on the property
- Any active encumbrance = seller must clear it first
`.trim(),

  transfer_costs: `
**Transfer cost breakdown (typically 8–10% of purchase price):**
- Capital Gains Tax (CGT): 6% of selling price or BIR zonal value (whichever higher)
- Documentary Stamp Tax (DST): 1.5% — pay at BIR by 5th of month after notarisation
- Local Transfer Tax: 0.5% in provinces, 0.75% in cities
- Registration Fee: ~0.25% at Registry of Deeds
- Notarial Fee: 1–2% of selling price

**BIR Zonal Value:** Minimum land value set by BIR for tax purposes. CGT and DST are calculated on whichever is higher — selling price or zonal value.

**Also check:** Unpaid real property taxes (amilyar) attach to the land — any back taxes become the buyer's liability at title transfer.
`.trim(),

  carp_agricultural: `
**CARP (Comprehensive Agrarian Reform Program, RA 6657):**
- Limits agricultural landowners to retaining maximum 5 hectares
- Land beyond this may have been redistributed to farmer-beneficiaries
- DAR clearance required before Registry of Deeds will register agricultural land transfer
- Request DAR clearance from Municipal Agrarian Reform Office (MARO) or Provincial ARO (PARO)
- Allow 30–60 days for processing

**Tenant rights:**
- Agricultural tenants have statutory rights under CARL that cannot be bypassed
- Cannot be removed simply because ownership transferred
- Disturbance compensation required (DAR formula) to displace a tenant

**DAR Conversion (agricultural → residential/commercial):**
- Requires formal DAR Conversion Order — separate from LGU zoning reclassification
- Process takes 6–12 months, not guaranteed
- NIPAS-protected land and land with irrigation infrastructure: generally prohibited from conversion
`.trim(),

  spa_remote_buying: `
**Special Power of Attorney (SPA) for remote buying:**
- Authorises a named representative (attorney-in-fact) to act on buyer's behalf
- Must explicitly authorise: sign Deed of Absolute Sale, pay taxes/fees, file at BIR/RD/DHSUD, receive title

**Authentication:**
- Apostille Convention countries (UAE, Saudi, Singapore, US, Canada, UK, etc.): apostille by competent authority in host country
- Non-Apostille countries: consularise at nearest Philippine Embassy or Consulate
- Send original by tracked courier — digital copies not accepted

**If financing via Pag-IBIG:** Confirm if Fund requires its own SPA template before drafting.
`.trim(),

  financing: `
**Pag-IBIG Fund Housing Loan (2026):**
- Maximum: ₱10,000,000
- Term: up to 30 years
- Minimum: 24 monthly contributions to qualify
- OFW members: contribute via Virtual Pag-IBIG online
- SPA holder can file application at any Pag-IBIG branch

**Bank housing loans:**
- Up to 20-year term, ~20% down payment standard
- Some banks offer OFW-specific packages with streamlined requirements

**In-house developer financing:**
- No bank approval required
- Down payment spread over 24–36 months at 0% interest
- Higher interest rate on outstanding balance
`.trim(),

  deceased_owner: `
**Deceased owner on title:**
- Standard Deed of Absolute Sale will be REJECTED by BIR and Registry of Deeds
- Requires: Extrajudicial Settlement of Estate among Heirs with Absolute Sale
- ALL legal heirs must sign — one excluded heir = future legal challenge possible
- Must be published in newspaper of general circulation for 3 consecutive weeks
- A licensed Philippine attorney must draft the document
`.trim(),

  brokers_lawyers: `
**PRC-licensed real estate brokers (RA 9646):**
- Regulated and professionally accountable — licence can be revoked for misconduct
- Can handle most straightforward transactions without a lawyer
- Verify broker's PRC licence number at the PRC online portal

**When a lawyer is required:**
- Deceased owner on the title (estate settlement)
- Active encumbrances or liens
- Agricultural tenants on the land
- CARP-covered land
- DAR conversion application
- Complex estate or inheritance situations
`.trim(),
};

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'lupaph-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_listings',
      description: 'Search verified Philippine real estate listings on lupaph.com by province, type, price, and more.',
      inputSchema: {
        type: 'object',
        properties: {
          province: { type: 'string', description: 'Province slug, e.g. "cavite", "batangas", "cebu", "davao-del-sur"' },
          type: { type: 'string', enum: ['residential', 'farm', 'beach', 'agricultural', 'condo', 'commercial', 'lot'], description: 'Property type' },
          min_price: { type: 'number', description: 'Minimum price in PHP' },
          max_price: { type: 'number', description: 'Maximum price in PHP' },
          search: { type: 'string', description: 'Full-text search query' },
          sort: { type: 'string', enum: ['newest', 'price_asc', 'price_desc', 'area_desc'], default: 'newest' },
          is_foreclosure: { type: 'boolean', description: 'Filter bank foreclosure properties only' },
          limit: { type: 'number', default: 10, description: 'Number of results (max 20)' },
        },
      },
    },
    {
      name: 'get_listing',
      description: 'Get full details of a specific Philippine property listing by its slug.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Listing slug from search results' },
        },
        required: ['slug'],
      },
    },
    {
      name: 'get_province_listings_summary',
      description: 'Get a summary of available listings and property types for a Philippine province.',
      inputSchema: {
        type: 'object',
        properties: {
          province: { type: 'string', description: 'Province slug, e.g. "cavite", "laguna", "cebu"' },
        },
        required: ['province'],
      },
    },
    {
      name: 'calculate_transfer_cost',
      description: 'Calculate the full Philippine land title transfer costs (CGT, DST, transfer tax, registration fee, notarial fee) for a given property price.',
      inputSchema: {
        type: 'object',
        properties: {
          selling_price: { type: 'number', description: 'Agreed selling price in PHP' },
          zonal_value: { type: 'number', description: 'BIR zonal value in PHP (if known — defaults to selling price)' },
          location_type: { type: 'string', enum: ['province', 'city'], default: 'province', description: 'Province = 0.5% transfer tax, City = 0.75%' },
        },
        required: ['selling_price'],
      },
    },
    {
      name: 'get_legal_info',
      description: 'Get accurate Philippine real estate legal information — ownership rules, title verification, CARP, SPA requirements, transfer costs, and more.',
      inputSchema: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            enum: ['ownership_rights', 'title_verification', 'transfer_costs', 'carp_agricultural', 'spa_remote_buying', 'financing', 'deceased_owner', 'brokers_lawyers'],
            description: 'Legal topic to look up',
          },
        },
        required: ['topic'],
      },
    },
    {
      name: 'search_guides',
      description: 'Search lupaph.com real estate guides and articles about buying land in the Philippines.',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Article category, e.g. "buying-guide", "ofw-guide", "legal-guide"' },
          limit: { type: 'number', default: 5 },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'search_listings') {
      const params = new URLSearchParams();
      if (args.province) params.set('province', args.province);
      if (args.type) params.set('type', args.type);
      if (args.min_price) params.set('min_price', args.min_price);
      if (args.max_price) params.set('max_price', args.max_price);
      if (args.search) params.set('search', args.search);
      if (args.sort) params.set('sort', args.sort);
      if (args.is_foreclosure) params.set('is_foreclosure', 'true');
      params.set('limit', Math.min(args.limit || 10, 20));

      const data = await fetchApi(`/listings?${params}`);
      const listings = (data.listings || data).slice(0, 20);

      if (!listings.length) {
        return { content: [{ type: 'text', text: 'No listings found for those filters. Try broadening your search — remove price limits or try a different province.' }] };
      }

      const formatted = listings.map(l => [
        `**${l.title}**`,
        `Type: ${l.property_type} | Area: ${l.lot_area_sqm ? l.lot_area_sqm + ' sqm' : 'N/A'}`,
        `Price: ₱${Number(l.price_php).toLocaleString()}${l.price_negotiable ? ' (negotiable)' : ''}`,
        `Location: ${l.municipality || ''}, ${l.province || ''}`,
        l.title_status ? `Title: ${l.title_status}` : '',
        l.is_foreclosure ? '🏦 Bank foreclosure' : '',
        `URL: https://lupaph.com/listing/${l.slug}`,
      ].filter(Boolean).join('\n')).join('\n\n---\n\n');

      return { content: [{ type: 'text', text: `Found ${listings.length} listing(s):\n\n${formatted}` }] };
    }

    if (name === 'get_listing') {
      const data = await fetchApi(`/listings/${args.slug}`);
      const l = data.listing || data;

      const text = [
        `# ${l.title}`,
        `**Price:** ₱${Number(l.price_php).toLocaleString()}${l.price_negotiable ? ' (negotiable)' : ''}`,
        `**Type:** ${l.property_type}`,
        `**Area:** ${l.lot_area_sqm ? l.lot_area_sqm + ' sqm' : 'N/A'}`,
        `**Location:** ${l.barangay ? l.barangay + ', ' : ''}${l.municipality || ''}, ${l.province || ''}`,
        `**Title Status:** ${l.title_status || 'Not specified'}`,
        `**Terms:** ${l.terms || 'Not specified'}`,
        l.is_foreclosure ? '**🏦 Bank Foreclosure Property**' : '',
        `**Seller:** ${l.seller_name || 'N/A'}${l.is_broker ? ' (Licensed Broker)' : ''}`,
        l.phone ? `**Phone:** ${l.phone}` : '',
        l.description ? `\n**Description:**\n${l.description}` : '',
        `\n**View listing:** https://lupaph.com/listing/${l.slug}`,
      ].filter(Boolean).join('\n');

      return { content: [{ type: 'text', text }] };
    }

    if (name === 'get_province_listings_summary') {
      const params = new URLSearchParams({ province: args.province, limit: 5 });
      const [allData, farmData, beachData, residentialData] = await Promise.all([
        fetchApi(`/listings?${params}`),
        fetchApi(`/listings?province=${args.province}&type=farm&limit=3`),
        fetchApi(`/listings?province=${args.province}&type=beach&limit=3`),
        fetchApi(`/listings?province=${args.province}&type=residential&limit=3`),
      ]);

      const all = allData.listings || allData;
      const farms = farmData.listings || farmData;
      const beaches = beachData.listings || beachData;
      const residential = residentialData.listings || residentialData;

      const prices = all.map(l => Number(l.price_php)).filter(Boolean);
      const minP = prices.length ? `₱${Math.min(...prices).toLocaleString()}` : 'N/A';
      const maxP = prices.length ? `₱${Math.max(...prices).toLocaleString()}` : 'N/A';

      const text = [
        `## ${args.province.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — Property Summary`,
        `**Total active listings:** ${allData.total || all.length}`,
        `**Price range:** ${minP} – ${maxP}`,
        farms.length ? `**Farm lots available:** ${farmData.total || farms.length}` : '',
        beaches.length ? `**Beach/vacation land available:** ${beachData.total || beaches.length}` : '',
        residential.length ? `**Residential lots available:** ${residentialData.total || residential.length}` : '',
        `\n**Browse all:** https://lupaph.com/browse?province=${args.province}`,
      ].filter(Boolean).join('\n');

      return { content: [{ type: 'text', text }] };
    }

    if (name === 'calculate_transfer_cost') {
      const result = calcTransferCosts(args.selling_price, args.zonal_value, args.location_type);
      const lines = [
        `## Transfer Cost Breakdown`,
        `**Selling price:** ${result.selling_price}`,
        result.tax_base !== result.selling_price ? `**Tax base (zonal value used):** ${result.tax_base}` : '',
        '',
        '| Cost Item | Rate | Amount | Note |',
        '|---|---|---|---|',
        ...Object.entries(result.breakdown).map(([k, v]) =>
          `| ${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} | ${v.rate} | ${v.amount} | ${v.note} |`
        ),
        '',
        `**Total transfer costs: ${result.total_transfer_costs}** (${result.percentage_of_price} of purchase price)`,
        `**Total amount needed: ${result.total_with_purchase}**`,
        '',
        `> ${result.note}`,
        '',
        'Source: lupaph.com/tools/cost-calculator',
      ].filter(s => s !== null).join('\n');

      return { content: [{ type: 'text', text: lines }] };
    }

    if (name === 'get_legal_info') {
      const info = LEGAL_TOPICS[args.topic];
      if (!info) return { content: [{ type: 'text', text: `Unknown topic: ${args.topic}` }] };

      return {
        content: [{
          type: 'text',
          text: `## Philippine Real Estate Law: ${args.topic.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n\n${info}\n\n---\n*Source: lupaph.com — verified Philippine real estate guides*`,
        }],
      };
    }

    if (name === 'search_guides') {
      const params = new URLSearchParams();
      if (args.category) params.set('category', args.category);
      params.set('limit', args.limit || 5);
      params.set('status', 'published');

      const data = await fetchApi(`/articles?${params}`);
      const articles = (data.articles || data).slice(0, 10);

      if (!articles.length) return { content: [{ type: 'text', text: 'No guides found for that category.' }] };

      const formatted = articles.map(a =>
        `**${a.title}**\n${a.excerpt || ''}\nhttps://lupaph.com/blog/${a.slug}`
      ).join('\n\n');

      return { content: [{ type: 'text', text: `## LupaPH Real Estate Guides\n\n${formatted}` }] };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };

  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
