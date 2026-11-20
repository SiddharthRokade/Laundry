# FreshFold Laundry Marketplace

A hyperlocal laundry services marketplace for customers, laundry partners, delivery operators and marketplace admins.

## Working prototype (first milestone)

Open **[prototype.html](prototype.html)** in your browser (or download the repository and open the file locally). This is a functional single-file sample experience with:

- Laundry-service selection and nearby-partner listing using fictional Aurangabad demo data
- Partner distance, ratings, pickup and express filters
- Garment quantity selection with itemized prices, pickup charge and express surcharge
- Customer booking (stored locally in that browser)
- Partner order acceptance and step-by-step fulfillment
- Admin demo dashboard with orders and sample metrics

**Important:** This is **not yet** a deployed end-to-end production application. All demo data is local to one browser. There is no real customer login, location lookup, photo upload, payment, partner settlement, or cross-device order synchronization. Do not use it to process real customer data or payments.

## Next implementation stages

1. React Native/Expo app and Next.js admin frontend
2. Supabase PostgreSQL/PostGIS data model, Auth, RLS and secure backend order functions
3. Verified partner onboarding and genuine nearby search using routing services
4. Garment photographs, order confirmation, pickup/drop workflow and realtime updates
5. Payment verification, invoices, refunds, commissions, payouts
6. Testing, monitoring, deployment and controlled partner/customer pilot

For the fuller multi-file browser demo and draft database migration, use the downloadable project bundle from our ChatGPT project conversation, then import the tested files into this repository.

Do **not** commit authentication secrets, service-role keys, payment API keys, or customer photographs.