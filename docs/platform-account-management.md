# Platform customer management

Platform Admin → Customer accounts & restaurants provides searchable owner accounts and restaurant locations. Only platform administrators can change another owner's plan, suspend, restore, or delete their account. Restaurant owners retain authorized restaurant settings actions; paid changes use the same Stripe synchronization service.

- Core upgrade: an owner without a current subscription receives a checkout link. Share that link with the owner. The webhook activates paid access after payment. No default trial or complimentary paid access is granted. Enable add-ons after the Core payment. Existing open owner checkout links are replaced by the new Core-only checkout.
- Free downgrade: cancels the subscription immediately and disables all paid add-ons. Retain at most one active restaurant first. Saved restaurant records remain in place. No automatic refund is issued.
- Restaurant add-ons: update Stripe HR/Bar quantities and access together. Prorations are invoiced immediately. Authentication or payment failure does not grant the feature. Configure distinct recurring Core, HR and Bar prices first. Subscriptions with unknown prices, pending changes, schedules, or unpaid invoices require review.
- Suspend: block owner and restaurant access and pause creation/collection of new subscription invoices using Stripe void behavior. Existing invoices remain unchanged. Reactivating resumes collection; voided invoices remain voided.
- Delete owner: cancel billing, expire open checkout links, and disable all owned restaurants and their POS integrations. Identity and historical records are retained so the account can be restored. This is a reversible deletion, not permanent data erasure.
- Delete restaurant: disable its customer access and POS integration, and remove its add-on charges. The owner's Core subscription continues. Restoring the restaurant does not restart add-ons or POS syncing; review and reconnect these separately.

Each change requires a reason. Deletions also require typing the owner email or restaurant name. Changes record an audit entry and a durable request identifier. If Stripe succeeds but the database fails, retry the saved pending request before making another change; this completes access synchronization without repeating billing. Requests with uncertain network results retain the original key. No existing customer billing changes automatically on deployment.

Release and startup migrations add account state, restaurant deletion timestamps, and durable management operations. These controls are website/backend changes and do not require another Android build by themselves. The separate inventory/mobile update still needs its updated APK.

Validation uses mocked Stripe and transaction adapters plus HTTP authorization checks. Live Stripe payment and production account actions still need controlled post-deployment verification.
