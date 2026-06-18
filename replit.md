# RestroFlow Restaurant Operations Platform

## Overview

RestroFlow is an enterprise-grade platform for restaurants, streamlining operations through inventory management, OCR invoice processing, real-time analytics, and cost monitoring. It features a modular, scalable architecture.

**Core Platform**: Includes inventory tracking, recipe costing, vendor management, purchase orders, waste tracking, OCR invoice processing, and real-time business intelligence.

**Employee Management Add-on**: A comprehensive HR system offering scheduling, task management, team messaging, performance tracking, time clock functionality, and payroll integration.

The platform also provides a Progressive Web App (PWA) for mobile management and a robust security framework. Its business vision includes scalable revenue growth through modular add-ons and strong market potential by addressing critical restaurant operational needs.

## User Preferences

Preferred communication style: Simple, everyday language.
Multi-location restaurant business: Table-top restaurant and bar & grill as second location.
Target features: Location-specific inventory, bar-specific items, separate analytics per location.
POS Systems: Uses SpotOn POS at the bar, Clover at main restaurant - needs universal POS integration.
UI Preference: Single Analytics & Reports page instead of separate pages for streamlined navigation.
Business Strategy: Modular add-on approach for employee management to enable scalable revenue growth and market segmentation.

## System Architecture

### UI/UX Decisions
- **Mobile App**: Progressive Web App (PWA) with a mobile-first, touch-optimized interface, responsive dashboard, and role-based UX.
- **Visual Identity**: Dark theme with gradient backgrounds, custom color schemes, and interactive elements.
- **Analytics**: Consolidated 4-tab structure for streamlined navigation:
  - **Overview**: Real-time metrics, live sales data, BI summary cards, top/low performing items
  - **Performance Insights**: Detailed business intelligence KPIs, menu performance analysis, profitability metrics, and trend analysis
  - **Cost & Waste**: Budget tracking, cost trends, variance analysis (inventory/production/record production), and price monitoring
  - **Reports & Exports**: P&L statements, daily controllable P&L charts, and data export functionality

### Technical Implementations
- **Frontend**: React 18 with TypeScript and Vite, using shadcn/ui (Radix UI + Tailwind CSS), TanStack Query, Wouter, and React Hook Form with Zod.
- **Backend**: Node.js with Express.js (ES modules), Drizzle ORM (PostgreSQL), and Replit's OpenID Connect integration with Passport.js.
- **Database**: PostgreSQL on Neon, managed with Drizzle.
- **Authentication**: Replit OIDC, server-side sessions with secure HTTP-only cookies, automatic user management, and basic role-based access control.
- **Security**: SOC2-style standards including rate limiting, security headers, input validation, audit logging, and role-based access control.
- **Monetization**: Subscription-based OCR access with a freemium model and credit tracking.
- **Invoice Processing**: Real database operations for invoice creation/statistics, advanced free OCR (PDF-to-image conversion, Tesseract), multi-page PDF support, and data sanitization.
- **POS Integration**: Universal multi-provider connector supporting Clover (webhooks), SpotOn (scheduled polling with lag-window strategy), Toast, and Revel. Features comprehensive error handling, idempotency checks, and a safeFetch helper. SpotOn integration includes near-realtime order polling (1-min intervals) and daily 26-hour backfill. Employee sync from POS systems (Clover, SpotOn) uses a three-table architecture for vendor-agnostic normalization (`pos_employees`, `pos_employee_mappings`, `pos_timeclocks`) with confidence scoring and sales attribution. Recipe-based POS integration links menu items to recipes for Universal Recipe Costing across POS systems, deducting ingredients directly from inventory.
- **AI Features**: Real-time analytics with alerts and intelligent cost optimization.

### System Design Choices
- **Modular Architecture**: Core platform with add-ons (e.g., Employee Management) for scalable functionality and revenue growth.
- **Real-time Capabilities**: Real-time cost monitoring, analytics, and alerting systems.
- **Data Model**: Normalized relational database schema covering inventory, recipes, vendors, purchase orders, waste tracking, and transactions, including specific schemas for POS employee and time clock synchronization.

## External Dependencies

### Database Services
- **Neon PostgreSQL**: Serverless PostgreSQL hosting.

### Authentication Services
- **Replit OIDC**: OpenID Connect authentication provider.

### Frontend Libraries
- **Radix UI**: Accessible UI primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **TanStack Query**: Server state management.
- **React Hook Form**: Form management with validation.
- **Zod**: Runtime type validation.

### Development Tools
- **Vite**: Fast development server and build tool.
- **Drizzle Kit**: Database migration and schema management.
- **TypeScript**: Static type checking.

### Utility Libraries
- **date-fns**: Date manipulation.
- **clsx/twMerge**: Conditional CSS class utilities.