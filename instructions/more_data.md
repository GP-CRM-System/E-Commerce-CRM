# Data Schema Documentation for Menna

## Users

1. Name: user's full name
2. email: user's email
3. image(optional): user's image
4. provider: login with google, microsoft, etc...
5. password: user's password
6. role

Note: each user can be connected to one or more organizations and has one role in each of them

## Organization

The company/startup using the CRM, created by the root user

1. name: org's name
2. slug: 7aga zy el username but for organizations
3. logo(optional): org's logo

users can be invited to the org using an email

## Role

Defines what the user can access

1. name: role name (HR Coordinator, Sales Manager...)
2. permissions: list of permissions for role (read customers, delete orders ...)

## Customer

1. name
2. email
3. phone number
4. city
5. address
6. source: where did we get this customer(website, social media, campaign, etc... )
7. lifecycle stage: 7aga zy el status bt3ato (LOYAL, CHURNED, VIP)
8. total number of orders, total spent money, total refunded money, average order value, first order date, last order date
9. churn score, rfm score and segment, cohort month
10. accepts marketing calls/messages or not

## Customer events (customer history)

1. type of event: order placed, refund issued, tag added
2. description of event
3. date

## Note

Notes stored on customer

1. author of note
2. body of note
3. creation/update time

## Tag

Customer tags, used for segmentation

1. tag name
2. tag color

## Segments

used as quick filters to target customers

1. name
2. filter: example --> customers who spent greater than 1000 egp
3. description

## Products

1. name
2. price
3. description
4. SKU: code to specify product size or color...
5. category
6. image
7. barcode
8. weight
9. weight unit: if in kg, g, liters
10. inventory: how much left in stock
11. status: if active or draft or archived

## Product variant

like different sizes or color of the same product

1. name
2. sku
3. price
4. barcode
5. weight
6. weight unit: if in kg, g, liters
7. inventory: how much left in stock
8. status: if active or draft or archived

## Order

1. shipping status: pending, processing, shipped, delivered, cancelled
2. payment status: pending, paid, failed, refunded
3. subtotal: total before discounts
4. discount amount
5. tax amount
6. shipping amount
7. total amount
8. currency: USD, EGP
9. refund amount
10. tag
11. note
12. source: web, social

## Order Items

1. product
2. quantity
3. price

## Marketing Campaign

1. name
2. description
3. segment
4. type: email/sms
5. status: draft, scheduled, active, paused, completed
6. content: subject, body or template
7. scheduled time
8. actual start time
9. metrics: sent, delivered, opened, clicked, converted numbers

## Support Tickets

1. customer
2. order
3. subject
4. description
5. status (Open, Pending, Closed)
6. priority (low, medium, high, urgent)

## Audit Logs

for knowing who did what

1. user
2. action
3. target (customer)
4. time of action

--------------------------------------------

```ts
Organization
├── Members (User ↔ Organization)
├── Roles (OrganizationRole)
├── Customers
│   ├── Orders
│   │   └── OrderItems → Products
│   ├── Notes (User is author)
│   ├── Tags
│   └── CustomerEvents
├── Products
│   └── ProductVariants
├── Segments
├── Campaigns
├── Tags
├── SupportTickets
└── AuditLogs (User is actor)
```
