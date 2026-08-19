# Wolt Drive API Service Agreement — Technical & Commercial Analysis

**Companion to:** HAT GAO Architecture & Technical Analysis v1.0
**Source:** *Wolt Drive API Service Agreement*, Wolt Cyprus Limited ↔ Thị Yen Nguyen (t/a Hat Gao), signed by Partner 18 Aug 2026
**Date of analysis:** 19 August 2026

> This document contains your commercial terms, which the Agreement (§9.1) treats as confidential between you and Wolt. Keep it internal.

---

## 0. Read this first — three things before anything else

**0.1 — The agreement may not yet be in force.**
Your signature is timestamped *Tuesday, 18-Aug-2026 08:52:32*. Wolt's signatory block (Andreas Papagiannis) shows **`[empty signing timestamp]`**. The Agreement states it *"enters into force when both Parties have, electronically or by hand, signed."* On the copy you sent me, Wolt has not countersigned.

**Action:** ask Eleni Aristodemou to confirm the Agreement is executed and send you the fully countersigned copy. Do not treat your API access as contractually secure until you have it.

**0.2 — There is no technical annex.**
The Agreement contains commercial terms only. It does **not** contain your `merchant_id`, your `venue_id`, an API key, a webhook registration procedure, or any statement of which API flow (venueful vs venueless) you're on. Those still have to come from Wolt separately. My Section G.5 list is only partially closed.

**0.3 — "Wolt Drive Web: Included in Agreement scope: **No**"**
This one matters operationally. Wolt Drive Web is the manual, web-based interface for creating deliveries by hand. You have **not** got it. That means if our integration breaks — a bad deploy, an expired key, a Wolt API outage — there is no manual fallback to dispatch a courier. Your only options would be pickup-only or self-delivery.

**Recommendation: ask Wolt to add Wolt Drive Web to scope.** The Agreement already states the same Service Fee applies to Drive Web orders, so it shouldn't change your economics — it's an operational safety net, not a cost centre. This is a cheap request with a high payoff and I'd make it before go-live.

---

## 1. Parties and identifiers (now confirmed)

| Field | Value |
|---|---|
| Wolt entity | Wolt Cyprus Limited, Digeni Akrita 26, Nicosia 1055 |
| Wolt reg. no. / VAT | HE404490 / CY10404490R |
| Wolt commercial contact | Eleni Aristodemou |
| Wolt signatory | Andreas Papagiannis — andreas.papagiannis@wolt.com |
| Partner (legal) | Thị Yen Nguyen |
| Marketing name | **Hat Gao** |
| Partner VAT ID | CY01344367V |
| Registered address | 58 Vasiliou Voulgaroktonou, 1010, Nicosia |
| Point of sale | Hat Gao, 58 Vasiliou Voulgaroktonou, 1010, Nicosia |
| POS telephone | +357 22002235 |
| Business email | hatgao.restaurant@gmail.com |
| Commercial contact | Thị Yen Nguyen, +357 99944603 |
| **Technical contact** | **Tan Bui Ngoc Thien — tan.hatgao@gmail.com, +357 94605439** |

You are named as the technical contact, which means Wolt's API credentials and technical onboarding should come to you directly. Good — chase them at that address.

Two notes for the build:
- The legal entity is a **sole trader** (Thị Yen Nguyen), not a limited company — Company ID is blank. Stripe onboarding will therefore be an *individual/sole trader* KYC flow, not a company one. Have ID and proof of address ready.
- **"Hat Gao" is the registered marketing name.** Use it consistently across the site, Stripe statement descriptor and Wolt.

---

## 2. Your actual delivery costs — now confirmed

### 2.1 The fee schedule (Option A)

| Item | Amount |
|---|---|
| Base Fee | **€3.50**, covering the first **1,000 m** straight-line |
| Incremental Fee | **€0.50** per 1,000 m increment, *each started increment charged in full* |
| Maximum delivery distance | **10,000 m** straight-line |
| User No-Show Fee | **€3.00** |
| Venue Lateness Fee | **€1.00** at 10 min late, **+€0.10 per additional minute** |
| Extra Courier Fee | **€3.00** |
| Cancellation Fee | **€3.00** |
| Cash Handling Fee | **2.5%** of order value incl. VAT (only applies if cash is enabled — we are not using cash) |
| Invoicing | Monthly in arrears, 30-day payment terms, VAT added |

Your estimate of "approximately €3.50 minimum" was right. Now we have the exact curve.

### 2.2 The cost formula

```
cost = 3.50 + 0.50 × max(0, ceil(distance_metres / 1000) − 1)
```

Distance is **straight-line** (as the crow flies) from your venue to the customer, *not* driving distance. That's helpful for us: we can compute expected cost ourselves from coordinates without calling Wolt, which makes the admin pricing simulator accurate and instant.

### 2.3 What each delivery costs you

| Straight-line distance | Wolt cost (net) | With 19% VAT | Recoverable? |
|---|---|---|---|
| 0 – 1 km | €3.50 | €4.17 | Yes — you're VAT-registered |
| 1 – 2 km | €4.00 | €4.76 | Yes |
| 2 – 3 km | €4.50 | €5.36 | Yes |
| 3 – 4 km | €5.00 | €5.95 | Yes |
| 4 – 5 km | €5.50 | €6.55 | Yes |
| 5 – 6 km | €6.00 | €7.14 | Yes |
| 6 – 7 km | €6.50 | €7.74 | Yes |
| 7 – 8 km | €7.00 | €8.33 | Yes |
| 8 – 9 km | €7.50 | €8.93 | Yes |
| 9 – 10 km | €8.00 | €9.52 | Yes |
| Over 10 km | **Not available** | — | — |

Because you hold VAT ID CY01344367V, the VAT on Wolt's invoice is input VAT you reclaim. **Plan your margins on the net column.** Confirm with your accountant, but that's the normal treatment.

**Practical read for Nicosia:** most of the city sits within 5 km straight-line of Vasiliou Voulgaroktonou, so your realistic cost band is **€3.50–€5.50 per delivery**. The 10 km cap covers greater Nicosia comfortably; it will exclude Larnaca, Limassol and the villages.

### 2.4 The "started increment" trap

*Each started increment is charged in full.* A customer 1,050 m away costs €4.00, not €3.53. A customer 2,001 m away costs €4.50.

Two consequences:
- Our pricing simulator must use `ceil()`, not linear interpolation, or your projections will be optimistic.
- If you ever set distance-banded customer fees, **align your bands to Wolt's 1 km boundaries.** Bands that straddle a boundary guarantee you lose money on the far edge of each band.

---

## 3. The economics — can you actually afford this?

This is the question your whole project rests on, and now we can answer it properly.

**Assumptions (two of these you need to confirm):**
- Marketplace commission rate: **[ASSUMED 30% — I need your real number]**
- Stripe fee: roughly **1.5% + €0.25** for European cards **[confirm current Stripe pricing for Cyprus]**
- Wolt Drive cost per the table above, net of recoverable VAT
- Comparison is net-of-VAT throughout; food VAT is identical on both channels

**The question that matters:** *how much delivery cost can you absorb on a direct order and still net more than the same order through the marketplace?*

```
Absorbable delivery cost  =  (order value × commission rate)  −  Stripe fee
```

| Order value | Marketplace commission @30% | Stripe fee | **You can absorb up to** | Wolt cost @3 km | **Net advantage with FREE delivery** |
|---|---|---|---|---|---|
| €15 | €4.50 | €0.48 | €4.02 | €4.50 | **−€0.48** ✗ |
| €20 | €6.00 | €0.55 | €5.45 | €4.50 | **+€0.95** ✓ |
| €25 | €7.50 | €0.63 | €6.87 | €4.50 | **+€2.37** ✓ |
| €30 | €9.00 | €0.70 | €8.30 | €4.50 | **+€3.80** ✓ |
| €40 | €12.00 | €0.85 | €11.15 | €4.50 | **+€6.65** ✓ |
| €50 | €15.00 | €1.00 | €14.00 | €4.50 | **+€9.50** ✓ |

### What this tells you

**1. Free delivery is genuinely affordable above roughly €20 — and it gets more affordable as the order grows.** At €30 you're still €3.80 better off than the marketplace *after* giving delivery away entirely. That's a far stronger position than most restaurants are in, and it's because Wolt Drive's flat-ish fee doesn't scale with basket size the way commission does.

**2. Small orders are the problem, not distant ones.** A €15 order at 3 km loses money with free delivery. The fix is a **minimum order value** and a customer-paid fee below the threshold — not a distance restriction.

**3. Your free-delivery threshold falls out of the arithmetic.** Set it around **€25–€30**. Below that, the customer pays a fee; above it, delivery is free and you still beat the marketplace. That single rule simultaneously protects your margin *and* pushes up average order value — which is one of your stated goals.

**4. Distance matters less than you'd think.** Going from 1 km to 5 km costs you €2.00. Going from a €20 order to a €30 order earns you €3.00 in avoided commission. **Basket size beats distance.** Optimise for bigger orders, not closer ones.

Once you give me your real commission rate I'll redo this table exactly. If your rate is lower than 30% the picture tightens and the free-delivery threshold moves up; if it's higher, it loosens.

---

## 4. Contract clauses that become software requirements

These are obligations in the Agreement that the system must satisfy. Several were not in my v1.0 architecture — they're new requirements derived from the contract.

### 4.1 Mandatory — Wolt branding at checkout (§2.9)

> *"The Partner agrees to display the Wolt logo and brand name on the Partner Website and checkout where User(s) purchase the Service... In case the Partner offers multiple delivery options to its Users, the Partner shall ensure that the option of choosing Wolt is placed at the top of the available delivery options."*

**Requirement:** the Wolt logo and name must appear on the ordering site and at checkout. If we ever add a second delivery option, Wolt goes first in the list.

**Action:** request Wolt's brand asset pack and placement guidelines from Eleni. Do this early — it affects the checkout design, not just a footer.

**Note:** this is a real tension with your goal of owning the customer relationship. You cannot present direct delivery as unbranded. Frame it as a positive: *"Delivered by Wolt"* is a trust signal to a customer being asked to order somewhere new for the first time.

### 4.2 Mandatory — information you must publish (§2.1)

The site must publish: company information, your contact information, the price including VAT, features of the delivery service you're reselling, delivery methods, payment methods, delivery times, and **complaint handling**.

**Requirement:** proper Terms, Privacy Policy, Delivery Information and Complaints pages — not placeholders. These move from "nice to have before launch" to contractual obligations.

### 4.3 Mandatory — customer support details (§2.6)

You handle support for the food; Wolt handles support *during* an active delivery. Your support contact details must be *"clear and easily accessible."*

**Requirement:** the Wolt API's `customer_support` object (`url`, `email`, `phone_number`) must be populated on every delivery we create — that's how the courier and Wolt's support reach you. Your phone and email must also be visible on the order confirmation and status page.

### 4.4 Mandatory — product restrictions (§2.2–2.3)

Not deliverable via Wolt Drive without a separate written annex:
- products requiring **age verification** — this means **alcohol**
- products requiring **cold chain** or a specific delivery temperature
- illegal, explosive or dangerous goods; medicine

**Question for you: does Hat Gao sell beer, wine or spirits for delivery?** If so, either exclude them from delivery orders in the menu system (a per-product `delivery_eligible` flag, which I'd add to the schema regardless) or ask Wolt for the age-verification annex. Getting this wrong is a contract breach, not just a bad order.

### 4.5 Mandatory — order size (§2.15)

Each on-demand order must fit in the delivery compartments of **one standard-sized car**. Exceeding that authorises the €3.00 Extra Courier Fee.

**Requirement:** a configurable "large order" threshold (by item count or total volume). Above it, the admin warns staff at acceptance. We should also populate the API's `parcels` field honestly rather than sending a placeholder.

### 4.6 Operational — never contact the courier (§2.7)

All courier contact goes through Wolt.

**Requirement:** the admin order screen must show Wolt's support route, and must **not** surface a courier phone number as if staff should call it. Put this in the runbook and the staff training.

---

## 5. Penalty fees — and how the software prevents each one

This is the most useful thing the contract gives us: a precise list of ways to lose money, each of which is preventable in software. Every one of these is now a design requirement.

### 5.1 Venue Lateness Fee — €1.00 + €0.10/min *(the one that will actually bite)*

> *"If the Partner is responsible for a delay of 10 minutes compared to the pickup time estimate, Wolt is entitled to charge €1.00. Furthermore, an additional €0.10 will be charged for each minute exceeding the aforementioned 10 minutes."*

The pickup estimate comes from the `min_preparation_time_minutes` **we** send when creating the delivery. So this fee is triggered by *our own optimistic estimate*, not by an external event. If staff tap "15 minutes" during a Friday rush and the food takes 35, you pay €1.00 + €1.00 = €2.00 — and the courier waited 20 minutes in your doorway, which damages the relationship too.

**Design requirements:**
1. **The accept screen must default to a realistic prep time, not an optimistic one.** Default from a configurable value, and make the peak-hours default higher than the quiet-hours default.
2. **Staff must be able to extend the prep time after accepting**, and the UI should nudge them to do so *before* the deadline passes. **[NEEDS CONFIRMATION FROM WOLT: does the API support updating the pickup estimate after a delivery is created? I could not find an endpoint for this in the public documentation. If it doesn't exist, the correct estimate at acceptance time becomes critical, and we should consider a deliberate buffer.]**
3. **Track it.** Record promised prep time vs. actual ready time on every order and report the gap. If your average overrun is 6 minutes, the fix is to raise the default by 6 minutes — but you'll only know that if we measure it.
4. **Consider a deliberate buffer.** Quoting 25 minutes and being ready in 20 costs you nothing; the courier is dispatched to arrive at the quoted time. Quoting 20 and taking 25 costs you money *and* goodwill. **Round up, always.**

### 5.2 Cancellation Fee — €3.00

Charged if you cancel after Wolt has confirmed the Service order.

**This validates the core sequencing decision in the architecture.** We create the Wolt delivery **only after** the restaurant has pressed Accept. An order rejected at the kitchen never had a delivery to cancel, so it never incurs this fee. If we had created deliveries at checkout — which is the naïve design — every rejected order would cost you €3.00.

**Requirement:** the admin UI must warn staff explicitly, with the amount, before confirming any cancellation of an already-accepted order. Staff should know they're spending €3.00 of your money.

### 5.3 User No-Show Fee — €3.00, plus you lose the food

> *"If the User is not present at the delivery address... within five minutes from the delivery time indicated on the Wolt Tracking Interface and the User does not respond after two phone call contact attempts... the delivery may be canceled... the Courier Partner shall return the Purchased Items to the pickup location... **unless the Purchased Items are non-returnable by nature, including... foodstuffs which are perishable**."*

For a restaurant this is the worst fee on the list: €3.00 **plus** the full cost of food that will not come back. A no-show on a €35 order is a €35+ loss, not a €3 one.

**Design requirements:**
1. **Phone number accuracy is a financial control, not a form field.** Validate Cypriot mobile format at checkout. If no-shows become a pattern, add SMS OTP verification for delivery orders — I'd hold this in reserve for phase 2 rather than adding friction on day one.
2. **Tell the customer the rule at checkout, in plain words:** *"Please be reachable — the courier waits 5 minutes and will call you twice."* Most no-shows are people who didn't know.
3. **Send a "your order is on the way" notification** with the tracking link. Email in V1; SMS is worth costing for delivery orders specifically, since one prevented no-show pays for a lot of messages.
4. **Track no-shows per customer.** A repeat offender should be flagged, and eventually restricted to pickup or prepayment-only.

### 5.4 Extra Courier Fee — €3.00

Charged for redelivery due to your or the customer's error, or when an order needs a second courier because it doesn't fit one car.

**Requirements:** address confirmation step at checkout (show the geocoded address back to the customer on a map before payment); accurate `parcels` data; the large-order warning from §4.5.

### 5.5 Cash Handling Fee — 2.5%

Not applicable: we're card-only in V1, and cash also requires completing Wolt's KYC/KYB onboarding first. Worth knowing it exists — cash on delivery is a real conversion lever in Cyprus and this is your route to it later. At 2.5% plus the handling burden, it's a phase-2 commercial decision, not a technical one.

### 5.6 Summary — the fee-avoidance scorecard

| Fee | Amount | Prevented by |
|---|---|---|
| Lateness | €1.00 + €0.10/min | Conservative prep-time defaults, extension UI, measurement |
| Cancellation | €3.00 | Creating the delivery only after Accept |
| No-Show | €3.00 + lost food | Phone validation, clear customer messaging, tracking notifications |
| Extra Courier | €3.00 | Address confirmation, accurate parcel data, large-order warning |

None of these is expensive to build. All of them are expensive to omit.

---

## 6. Commercial and legal risks in the Agreement

### 6.1 No service level guarantee whatsoever (§5.1–5.4)

> *"the Service and Wolt Materials are provided on an 'as is' and 'as available' basis... Wolt does not give representations and warranties of any kind relating to the Service, including its reliability, timeliness, security, availability."*

Wolt owes you no uptime, no delivery-time guarantee and no remedy if couriers simply aren't available on a rainy Friday night.

**This changes a design decision.** The system needs a **delivery kill-switch** in the admin dashboard — one button that immediately stops offering delivery to new customers and leaves pickup running. If Wolt is down or couriers are unavailable, you need to stop taking orders you can't fulfil *within seconds*, not after a support ticket.

I'm adding this to the architecture as a Phase 4 requirement. It's also the answer to §5.4's "Wolt may discontinue the Service temporarily."

### 6.2 Wolt can raise prices at will (§3.2)

> *"Wolt shall have the right to adjust the Wolt Service Fee and any other applicable fees in its sole discretion... at least 15-day prior written notice... Partner is entitled to terminate the Agreement by notifying Wolt within 7 days."*

Fifteen days' notice, and your only remedy is to leave — with a 7-day window to say so.

**Design implication:** the base fee, increment size and increment distance must all be **editable settings**, not constants in code. When Wolt raises the base fee to €4.00, you change one number and your pricing simulator stays truthful. This was already the plan; the contract makes it mandatory.

**Calendar implication:** watch for notices from Wolt and diarise the 7-day window. Missing it means accepting the increase by default.

### 6.3 Liability capped very low (§7.1)

Wolt's liability is capped at the **Service Fees you paid in the preceding 3 months**, and excludes all indirect damages, lost profits and lost sales.

At, say, 200 deliveries a month at €4.50, that cap is around €2,700 — but only after three months of volume. Early on it will be a few hundred euros.

**Practical consequence:** if a courier loses a large order or a delivery goes badly wrong, your recovery is limited and slow. Log every delivery failure with the `wolt_order_reference_id`, the order value and the evidence, and claim promptly. The system should make this a one-click report rather than an archaeology exercise.

### 6.4 Termination (§4.1–4.2)

- **1-month trial from signing** — either party can terminate with **immediate effect**. Signed 18 Aug 2026, so this runs to roughly 18 Sep 2026.
- After the trial: rolling, terminable by either party on **30 days' written notice**.
- Wolt can terminate on **10 days' notice** for any breach, or immediately if you cease business.

**Read:** there's no lock-in and no minimum volume commitment, which is good. But during the trial month Wolt could walk away instantly. That's an argument for the sequencing I already recommended — **build pickup first (Phase 3), which needs nothing from Wolt** — rather than making Wolt the critical path.

There is no minimum order commitment anywhere in the Agreement, so a slow start costs you nothing.

### 6.5 API usage restrictions (§8.6)

No reverse engineering, no vulnerability probing, no scraping, no "actions that could damage, disable, overburden or impair."

**Practical consequences for us:**
- **Do not load-test against Wolt's API**, including their development environment. If we need load testing, we mock the Wolt client.
- Rate-limit our own calls. Every address keystroke must not fire a shipment-promise request — debounce, and only quote on a completed address.
- No scraping Wolt marketplace for menu or pricing data, for any purpose.

### 6.6 Confidentiality (§9.1)

Terms are confidential. Don't publish your fee schedule, and don't put it in a public repository. Delivery-cost constants belong in database settings or environment configuration — **not** in committed source code.

### 6.7 Governing law

Main Agreement: laws of the country where Wolt is registered — Wolt **Cyprus** Limited, so Cyprus law, courts in Nicosia. Note the DPA (§11.1) has a fallback to Finnish law and the District Court of Helsinki in certain circumstances. Not something to act on, just be aware the two documents point to different forums.

---

## 7. GDPR — one item closed, three opened

**Closed:** Appendix 1 **is** your Data Processing Agreement with Wolt, GDPR Article 28 compliant. You no longer need to request one. That's one item off Section K of the architecture doc.

**The roles are now confirmed:**
- **You are the Data Controller.** Wolt is the **Processor** for customer personal data (§6.2).
- Wolt is an independent Controller for *your* contact persons' data (§6.1).
- Wolt processes the customer's **name, address and telephone number** to complete the delivery (DPA §2.1), plus a user ID and technical data.

**Three obligations this creates for you:**

1. **You must inform data subjects (DPA §1.2).** Your privacy policy must state that customer name, address and phone are shared with Wolt Cyprus Limited for delivery. Naming the processor is not optional.

2. **International transfers must be disclosed (DPA §7.1).** Some of Wolt's sub-processors are **outside the EU/EEA**, covered by Standard Contractual Clauses. Your privacy policy must disclose non-EEA transfers. The sub-processor list is published at `https://explore.wolt.com/en/fin/wolt-drive/subcontractors` — review it before writing the policy.

3. **You get 14 days to object to new sub-processors (DPA §6.1).** Wolt notifies you of changes; if you object and they proceed, you may terminate on 30 days' notice. Practically: don't let those emails go unread in the gmail account.

Also worth noting: **you define the retention periods** (DPA §2.3), and on termination you choose whether Wolt returns or deletes the data (§2.4). Both are decisions to make, not defaults to accept.

---

## 8. What the contract answered, and what's still open

### 8.1 Now closed from Section G.5

| # | Question | Answer |
|---|---|---|
| 4 | Wolt Drive pricing | **Confirmed.** €3.50 base / 1 km, €0.50 per further started 1 km, 10 km max, plus the penalty schedule. |
| — | Do you have a DPA? | **Yes** — Appendix 1. |
| — | Is there a price parity clause in the *Drive* contract? | **No.** §2.4: *"Partner independently determines the price for the Service that the Partner resells to and charges from the User."* You may price delivery however you like. **This does not clear the marketplace contract — see §9.** |

### 8.2 Still open — chase these with Eleni Aristodemou

| # | What to ask for |
|---|---|
| 1 | **Fully countersigned copy** of the Agreement |
| 2 | `merchant_id` and `venue_id` for Hat Gao |
| 3 | **Merchant Key / API token** — development *and* production |
| 4 | Confirmation that the **development environment** is enabled for your account |
| 5 | Webhook registration procedure — do we self-register via `POST /v1/merchants/{merchant_id}/webhooks`, or does Wolt configure it? |
| 6 | Confirmation you're on the **venueful** flow (`shipment-promises` + `deliveries`) |
| 7 | Is there **any endpoint to read a delivery's current status**? The public docs show webhooks only. |
| 8 | **Can `min_preparation_time_minutes` be updated after a delivery is created?** Directly affects the Lateness Fee. |
| 9 | API **rate limits** (docs describe 429 handling but not the limits) |
| 10 | Merchant admin portal access — the definition of "Tracking Interface" mentions *"access made available by Wolt to Partner to Wolt's proprietary merchant admin portal."* Get the login; it's your manual visibility layer. |
| 11 | **Please add Wolt Drive Web to scope** (see §0.3) |
| 12 | **Wolt brand assets and placement guidelines** for the §2.9 checkout requirement |
| 13 | Your confirmed **delivery area polygons** and Wolt Drive **operating hours** for Nicosia |
| 14 | Whether an **age-verification annex** is available, if you want to deliver alcohol |

I'd send these as a single numbered email. Items 2–6 block Phase 4; the rest can run in parallel.

---

## 9. The marketplace contract — still the biggest open question

You've given me the **Drive** contract. The parity risk I flagged lives in the **marketplace** contract, which is a separate agreement and is not addressed here. The Drive agreement explicitly says (§1.1) it *"shall not alter or impact any other possible agreement between the Parties regarding other services provided by Wolt to Partner."* So your marketplace terms are untouched and unexamined.

**Why it still matters:** the single strongest lever for moving customers to direct ordering is better pricing or better offers on your own site. If your marketplace agreement restricts that, the strategy changes — not the project, but the promotions design and the launch marketing.

**How to get it:**
1. Search the `hatgao.restaurant@gmail.com` inbox for the original onboarding email from Wolt — the signed agreement is usually attached or linked from the e-signature provider.
2. Check **Wolt Merchant Portal** (merchant.wolt.com) — contracts are often available under the account or documents section.
3. Ask Eleni Aristodemou directly. She's your Wolt Cyprus contact for both relationships.

**What to look for when you have it:** any clause about price parity, rate parity, "most favoured nation" treatment, or restrictions on offering better prices, discounts or promotions on your own channels. Also check for exclusivity and for minimum-volume commitments.

Send it to me when you have it and I'll read it the same way.

**Until then, the safe strategy** — things almost never restricted by parity clauses:
- Loyalty and rewards for repeat direct customers
- Free delivery above a threshold (a delivery term, not a food price)
- Direct-only bundles and combos that don't exist on the marketplace
- Pickup discounts (marketplace parity rarely covers pickup)
- Better portions, free extras, or a free item with direct orders

All of these work without undercutting your marketplace menu prices, and all of them are supported by the promotions design in Phase 7.

---

## 10. VAT — a question for your accountant, not for me

The Wolt Service Fee attracts standard-rate Cyprus VAT (19%), which you reclaim as input VAT.

The one that needs an answer before we build the pricing engine: **what VAT rate applies to your food when it's delivered, versus dine-in?** Cyprus has 9% for restaurant and catering services and 5% for food and beverages, and the treatment of takeaway and delivered food is exactly the kind of distinction that varies by jurisdiction and interpretation.

**Separately: is the delivery fee you charge the customer subject to VAT, and at what rate?**

Both answers change the numbers we store on every single order. Getting them wrong is retroactively expensive. Please put these two questions to your accountant — I'd rather build to their answer than to my assumption.

---

## 11. Updated action list

**This week — commercial, no code involved**

1. Confirm with Eleni Aristodemou that the Agreement is **countersigned**; get the executed copy
2. Send the 14 numbered technical questions from §8.2
3. **Ask for Wolt Drive Web to be added to scope** as an operational fallback
4. Retrieve the **marketplace contract** and send it to me
5. Ask your accountant the two **VAT questions** in §10
6. Tell me your actual **marketplace commission rate** so I can finalise the economics table
7. Decide: **do you want to deliver alcohol?** (determines whether you need the age-verification annex)

**Feeding into the build**

8. New schema field: `delivery_eligible` per product (alcohol, cold-chain, oversized)
9. New setting: Wolt fee constants — base fee, increment amount, increment distance, max distance
10. New admin feature: **delivery kill-switch**
11. New admin feature: **prep-time extension** after acceptance
12. New tracking: promised vs. actual ready time, per order
13. New checkout requirements: Wolt branding, address confirmation step, courier-waits-5-minutes notice
14. New pages: Terms, Privacy (naming Wolt as processor + non-EEA transfers), Delivery Info, Complaints

**Unchanged and still right**

The core architecture holds. The contract validated two decisions in particular: creating the Wolt delivery only *after* the restaurant accepts (avoids the €3.00 Cancellation Fee on every rejected order), and keeping delivery pricing fully configurable (necessary, because Wolt can change your costs on 15 days' notice).

---

## 12. The headline

**The economics work.** At an assumed 30% marketplace commission, a €25 direct order leaves you roughly **€2.37 better off even if you give delivery away entirely** — and the advantage grows with basket size. Your delivery cost across most of Nicosia is €3.50–€5.50 net, and it's recoverable-VAT and commission-free.

The two things that will actually erode that advantage are **penalty fees from sloppy operations** — mainly optimistic prep times — and **small orders**. Both are solvable: conservative prep-time defaults, and a minimum order value with a free-delivery threshold around €25–€30.

The project is on solid commercial ground. The remaining unknowns are administrative, not structural.

---

## Sources

- *Wolt Drive API Service Agreement*, Wolt Cyprus Limited ↔ Thị Yen Nguyen, signed 18 Aug 2026 (16 pp., including General Terms and Appendix 1 Data Processing Agreement) — supplied by the client
- [Wolt Drive API endpoints — Wolt for Developers](https://developer.wolt.com/docs/wolt-drive/endpoints)
- [Wolt Drive API webhook service — Wolt for Developers](https://developer.wolt.com/docs/wolt-drive/webhooks)
- [Cyprus VAT rates — VATToolkit](https://www.vattoolkit.com/vat-rates/cyprus)
