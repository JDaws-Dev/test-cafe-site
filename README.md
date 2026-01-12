# Artios Academies Cafe Lunch Order System

School lunch ordering system for Artios Academies of Sugar Hill.

## Tech Stack
- Static HTML/CSS/JS
- Google Sheets backend (via Apps Script)
- Venmo deep links for payment
- GitHub Pages hosting

## Pages
- `index.html` - Redirects to login
- `login.html` - Family login page
- `dashboard.html` - Family portal (place orders, view history)
- `orders.html` - Main ordering page with menu and cart
- `manage-orders.html` - Order history, cancellations, refunds
- `admin-hub.html` - Admin dashboard for staff
- `checklist-page.html` - Kitchen prep checklist

## Recent Updates (Jan 11, 2025)

### CFA Rebrand
- Replaced olive green palette with CFA-inspired warm red (#E51636)
- Updated all pages: orders.html, dashboard.html, login.html, admin-hub.html, manage-orders.html

### Mobile Cart Redesign
- Replaced ugly drawer with floating cart button + modal
- Fixed cart total not updating on item add
- Added scroll indicator for cart overflow on desktop

### Header Cleanup
- Removed "Cloud Sync Active" badge (unnecessary clutter)
- Simplified "Back to Dashboard" button to clean text link
- Redesigned order cutoff/questions section as inline info bar (not yellow warning box)

### Bug Fixes
- Fixed 404 on Order History (was linking to non-existent order-history.html, now links to manage-orders.html)
- Fixed null reference error for family-avatar element in dashboard.html

## TODO / Known Issues
- Deployment: No auto-deploy configured. Push to main, then manually pull on server or configure GitHub Pages/Netlify
- manage-orders.html may need additional styling updates to match new branding throughout

## Contact
Questions: CRivers@artiosacademies.com
