-- Demo business knowledge base (docs/tasks.md T9): Harbour Bean Café, the shop the triage set
-- (tests/fixtures/triage) and the draft preview are written for. Made-up business.
-- Included by supabase/seed.sql; re-runnable: replaces the demo tenant's entries.
-- Embeddings are filled by the job route's re-embed sweep (needs OPENROUTER_API_KEY).

update public.tenants set name = 'Harbour Bean Café'
where id = '10000000-0000-4000-8000-000000000001';

delete from public.kb_entries where tenant_id = '10000000-0000-4000-8000-000000000001';

insert into public.kb_entries (tenant_id, title, content) values
  ('10000000-0000-4000-8000-000000000001', 'Opening hours',
   'Monday to Friday 7:00am to 9:00pm. Saturday and Sunday 8:00am to 10:00pm. The kitchen takes last food orders 30 minutes before closing. Open on most public holidays from 9:00am to 6:00pm; closed on Christmas Day and New Year''s Day.'),
  ('10000000-0000-4000-8000-000000000001', 'Location and parking',
   'Unit 3, 88 Aurora Boulevard, Cubao, Quezon City, a 5-minute walk from Araneta City Cubao MRT station and across from Gateway Mall. This is our only branch. Free parking for 8 cars behind the building; paid parking at Gateway Mall.'),
  ('10000000-0000-4000-8000-000000000001', 'Coffee menu and prices',
   'Espresso ₱110, Americano ₱130, cappuccino ₱160, café latte ₱160, iced Spanish latte ₱180, matcha latte ₱190, cold brew ₱170 (bottled 350ml ₱190). Oat or almond milk +₱30. Sugar-free syrup on request at no charge.'),
  ('10000000-0000-4000-8000-000000000001', 'Pastries and bread',
   'Butter croissant ₱95, ensaymada ₱85, ube cheese pandesal ₱180 for a box of 6, banana bread slice ₱110. Baked fresh every morning; ube cheese pandesal is available daily until sold out, usually by 2pm.'),
  ('10000000-0000-4000-8000-000000000001', 'Food',
   'All-day breakfast and sandwiches from ₱220 to ₱320, pasta from ₱260. Gluten-free bread available for any sandwich (+₱40). Vegan pastries daily: vegan banana bread and oat cookies. Please tell the staff about allergies; our kitchen also handles nuts, dairy and gluten.'),
  ('10000000-0000-4000-8000-000000000001', 'Custom cakes',
   'Custom cakes need at least 3 days'' notice. Round cakes: 6-inch ₱1,200, 8-inch ₱1,800, 2-tier from ₱3,500. Photo print toppers +₱250. A 50% deposit confirms the order. Orders are confirmed by our cake team by DM; the receptionist can''t confirm dates.'),
  ('10000000-0000-4000-8000-000000000001', 'Catering and coffee cart',
   'We cater events of 10 to 150 people: pastry boxes, sandwich platters and a coffee cart with a barista. Coffee cart from ₱18,000 for up to 60 cups (3 hours). Quotes depend on date, headcount and location within Metro Manila; our events team sends a quote within 1 business day.'),
  ('10000000-0000-4000-8000-000000000001', 'Function room',
   'Private function room for up to 30 guests seated or 40 standing. ₱2,500 per hour with a minimum spend of ₱8,000 on food and drinks; minimum 3 hours. Bookings are confirmed by our events team after a deposit.'),
  ('10000000-0000-4000-8000-000000000001', 'Reservations',
   'We take table reservations for groups of 6 or more, up to 2 weeks ahead. Smaller groups are walk-in only. Reservations are held for 15 minutes.'),
  ('10000000-0000-4000-8000-000000000001', 'Payments',
   'We accept cash, GCash, Maya, and Visa or Mastercard credit and debit cards. No cheques.'),
  ('10000000-0000-4000-8000-000000000001', 'Delivery',
   'Delivery through GrabFood and foodpanda within about 5 km of Cubao. We don''t deliver ourselves, and cakes and catering are pickup or arranged with the events team.'),
  ('10000000-0000-4000-8000-000000000001', 'Pets, Wi-Fi and amenities',
   'Dogs are welcome on the outdoor terrace, not inside. Free Wi-Fi for customers (password on your receipt). Power outlets at the long table and the counter. One wheelchair-accessible restroom.'),
  ('10000000-0000-4000-8000-000000000001', 'Outside food and corkage',
   'You may bring your own birthday cake for a ₱300 cake corkage fee. Other outside food and drinks are not allowed.'),
  ('10000000-0000-4000-8000-000000000001', 'Barista workshop',
   'Beginner barista workshop on the first Saturday of every month, 9:00am to 12:00nn, ₱2,800 per person, maximum 8 people. Slots are confirmed by our team after payment.'),
  ('10000000-0000-4000-8000-000000000001', 'Contact',
   'For cakes, catering and events, DM us here or email events@harbourbean.ph. Café landline (02) 8123 4567 during opening hours.');
