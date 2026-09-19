#!/usr/bin/env node
/* ==========================================================================
   compact-keywords.mjs — Compact Keywords generator for S.I.T.E.S

   Implements Edward Sturm's bottom-of-funnel keyword method:
   purchase-intent phrases that are specific, low-competition and high-converting.

   Input: a business brief (JSON file) describing the business, location,
   specialties and services.
   Output: a blueprint fragment (Markdown) with:
     - one compact-keywords index tile
     - one keyword-landing tile per generated compact keyword

   Usage:
     node tools/compact-keywords.mjs business.json [--out pawn-shop.blueprint.md]

   The fragment is designed to be pasted into a full blueprint after the front
   matter and page heading.
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const inFile = args.find((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;

if (!inFile || !existsSync(inFile)) {
  console.error('Usage: node tools/compact-keywords.mjs <business.json> [--out <blueprint.md>]');
  process.exit(2);
}

const brief = JSON.parse(readFileSync(resolve(inFile), 'utf8'));

const business = String(brief.name || brief.business || 'Your business').trim();
const city = String(brief.city || '').trim();
const state = String(brief.state || '').trim();
const location = [city, state].filter(Boolean).join(', ') || city || 'your city';
const type = String(brief.type || 'business').trim().toLowerCase();
const specialties = Array.isArray(brief.specialties) ? brief.specialties : [];
const services = Array.isArray(brief.services) ? brief.services : ['buy', 'sell', 'loan'];
const differentiators = Array.isArray(brief.differentiators) ? brief.differentiators : [];
const phone = String(brief.phone || '[your phone number]').trim();
const address = String(brief.address || '').trim();

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (s) => String(s).replace(/\b\w/g, (c) => c.toUpperCase());

function makeKeywords() {
  const list = specialties.length ? specialties : ['items'];

  // Patterns are generated per specialty, then interleaved so a tight cluster
  // still represents every specialty instead of exhausting the first one.
  const perSpecialty = list.map((specialty) => {
    const spec = String(specialty).trim().toLowerCase();
    const mine = [];
    if (services.includes('buy') || services.includes('purchase')) {
      mine.push({
        keyword: `${titleCase(type)} that buys ${spec} in ${location}`,
        description: `${business} pays cash for ${spec} today — no appointment needed.`,
        specialty: spec, service: 'buy',
      });
      mine.push({
        keyword: `Sell ${spec} near me in ${city}`,
        description: `Get a fair offer and same-day cash when you sell ${spec} to ${business}.`,
        specialty: spec, service: 'sell',
      });
    }
    if (services.includes('sell')) {
      mine.push({
        keyword: `Buy used ${spec} in ${location}`,
        description: `Shop tested, warrantied ${spec} at ${business} for less than retail.`,
        specialty: spec, service: 'sell',
      });
    }
    if (services.includes('loan') || services.includes('pawn')) {
      mine.push({
        keyword: `Loan on ${spec} in ${location}`,
        description: `Secure a no-credit-check loan using your ${spec} as collateral at ${business}.`,
        specialty: spec, service: 'loan',
      });
    }
    return mine;
  });

  const keywords = [];
  const longest = Math.max(0, ...perSpecialty.map((m) => m.length));
  for (let round = 0; round < longest; round++) {
    for (const mine of perSpecialty) {
      if (mine[round]) keywords.push(mine[round]);
    }
  }

  // Generic local-intent patterns, appended only if the cluster has room.
  if (services.includes('loan') || services.includes('pawn')) {
    keywords.push({
      keyword: `Pawn shop ${location}`,
      description: `Fast collateral loans, buying and selling at ${business} in ${location}.`,
    });
    keywords.push({
      keyword: `Quick cash loan ${city}`,
      description: `No credit check, same-day cash loans backed by your valuables at ${business}.`,
    });
  }

  return keywords.slice(0, 12); // keep the cluster tight
}

/**
 * Draft one landing page body, following the method's five beats:
 * sub-problem, cost of leaving it, how it works, proof, next step.
 *
 * It is a DRAFT. A script knows the brief, not the business, so the beats that
 * need real detail (turnaround times, price ranges, licence numbers, review
 * counts) carry an explicit [bracketed] prompt instead of invented facts.
 * Inventing specifics is how a generated page becomes a liability — a promise
 * the business cannot keep, published under its name.
 */
function makeBody(kw) {
  const spec = (kw.specialty || 'items').toLowerCase();
  const thing = spec === 'items' ? 'items' : spec;
  const service = kw.service; // 'buy' | 'sell' | 'loan'
  const beats = [];

  // 1. Sub-problem — name the situation the searcher is actually in.
  if (service === 'sell' || service === 'buy') {
    beats.push(
      `You searched "${kw.keyword}" because you have ${thing} to move and you want a number today, not a listing that sits for three weeks. ` +
      `Online marketplaces mean photographing everything, answering messages from people who never show up, and meeting strangers with cash. ` +
      `${business} replaces that with one visit.`
    );
  } else {
    beats.push(
      `You searched "${kw.keyword}" because you need cash now and you would rather not borrow against your credit. ` +
      `A collateral loan uses ${thing} you already own, so the decision is about the item in front of you — not your credit report, ` +
      `your income history, or a lender's underwriting model.`
    );
  }

  // 2. Cost of not solving it.
  beats.push(
    `The expensive version of this problem is time. Every extra week of waiting is a week the ${thing} sits unused, ` +
    `and a "quick sale" that turns into a month of messages usually ends with someone accepting less than they wanted. ` +
    `Getting a real number in one visit is what stops that slide.`
  );

  // 3. How it works, with the brief's own facts.
  const steps = service === 'loan'
    ? [
        `Bring the ${thing} in during opening hours — no appointment needed.`,
        `We appraise it in front of you. [Typical appraisal time — replace with your real number.]`,
        `You get a loan offer in writing, with the terms and the repayment window stated plainly.`,
        `Accept and take the cash the same day, or decline and walk out with your item.`,
      ]
    : [
        `Bring the ${thing} in during opening hours — no appointment needed.`,
        `We appraise it in front of you and explain how the number was reached.`,
        `You get a cash offer on the spot. No obligation to accept it.`,
        service === 'sell'
          ? `Accept and leave with cash the same day.`
          : `Browse tested, warrantied ${thing} on the floor at prices below new retail.`,
      ];
  const hours = Array.isArray(brief.hours) && brief.hours.length
    ? ` We are open ${brief.hours.join(', ')}.`
    : '';
  beats.push(
    `Here is exactly what happens. ` +
    steps.map((s, i) => `${i + 1}. ${s}`).join(' ') + hours
  );

  // 3b. Specifics — the concrete detail that makes the page useful and gives the
  // search engine something to match beyond the headline.
  if (service === 'loan') {
    beats.push(
      `What we lend against: ${thing}, and [list the other categories you actually take]. ` +
      `Condition matters more than age — working condition and a clean ownership history are what set the number. ` +
      `Bring photo ID and the item itself; if it has a serial number or a receipt, bring that too, because documented ` +
      `provenance is the difference between a low offer and a good one.`
    );
  } else if (service === 'sell') {
    beats.push(
      `What is usually on the floor: ${thing}, and [list the other categories you stock]. ` +
      `Everything is checked before it goes out, and anything that does not pass does not get sold. ` +
      `Stock turns over quickly, so if you are looking for something specific, call ahead — we will tell you honestly ` +
      `whether it is in, and what we expect to have in this week.`
    );
  } else {
    beats.push(
      `What we buy: ${thing}, and [list the other categories you buy]. ` +
      `Condition matters, but "used" is not a disqualifier — working condition and a clean ownership history are what ` +
      `set the number. Bring photo ID and the item itself; if it has a serial number, a receipt or original packaging, ` +
      `bring that too, because documented provenance is the difference between a low offer and a good one.`
    );
  }

  // 4. Proof — the brief's differentiators, plus an explicit slot for evidence.
  if (differentiators.length) {
    beats.push(
      `What we are known for locally: ${differentiators.join('; ')}. ` +
      `[Add one concrete proof here — years in business, number of items bought, a customer line, a licence or accreditation.]`
    );
  } else {
    beats.push(
      `[Add one concrete proof here — years in business, number of items bought, a customer line, a licence or accreditation.] ` +
      `Proof is what separates this page from the ten other shops that also say they pay fair prices.`
    );
  }

  // 5. Next step + risk reversal.
  if (service === 'loan') {
    beats.push(
      `Come in or call ${phone} and we will tell you what your ${thing} is likely to bring before you make the trip. ` +
      `If the number works, you leave with cash today. If it does not, you keep your item and you have lost nothing but the visit.`
    );
  } else if (service === 'sell') {
    beats.push(
      `Come in or call ${phone} and we will tell you whether we have what you need. ` +
      `Everything on the floor has been tested, and [state your real warranty or return policy here].`
    );
  } else {
    beats.push(
      `Come in or call ${phone} for an appraisal. There is no fee to be quoted, and no obligation to sell — ` +
      `if our number is not right for you, you keep the ${thing} and we part on good terms.`
    );
  }

  return beats.join('\n\n');
}

const keywords = makeKeywords();

const lines = [];

lines.push('### Tile: compact-keywords');
lines.push('description: Index of compact-keyword landing pages for this business.');
lines.push(`id: ${slugify(type)}-compact-keywords`);
lines.push(`title: ${titleCase(type)} services in ${location}`);
lines.push(`intro: Find the exact ${type} service you need in ${location}. Each page targets a specific search so you land on the answer, not a generic home page.`);
lines.push('items:');
for (const kw of keywords) {
  const path = `/${slugify(kw.keyword)}.html`;
  lines.push(`  - keyword: "${kw.keyword}"`);
  lines.push(`    description: ${kw.description}`);
  lines.push(`    href: ${path}`);
  lines.push(`    label: Learn more`);
}
lines.push('');

for (const kw of keywords) {
  const id = slugify(kw.keyword);
  const path = `/${id}.html`;
  lines.push(`## Page: ${kw.keyword}`);
  lines.push(`path: ${path}`);
  lines.push('');
  lines.push('### Tile: keyword-landing');
  lines.push(`description: Landing page for "${kw.keyword}".`);
  lines.push(`id: ${id}`);
  lines.push(`headline: ${kw.keyword}`);
  lines.push('body: |');
  // A blank line inside the block scalar is what separates paragraphs. Without it
  // (or with a compiler that drops blank lines) the whole body compiles to a single
  // block and the page reads as one wall of text.
  makeBody(kw).split('\n\n').forEach((paragraph, i) => {
    if (i > 0) lines.push('');
    lines.push(`  ${paragraph}`);
  });
  lines.push('actions:');
  lines.push(`  - label: Get a quote`);
  lines.push(`    href: /contact.html`);
  lines.push(`    style: gold`);
  lines.push('');
}

const output = lines.join('\n');

if (outFile) {
  writeFileSync(resolve(outFile), output, 'utf8');
  console.log(`Wrote ${keywords.length} compact keywords to ${outFile}`);
} else {
  console.log(output);
}