# Demo script (5 minutes)

A walkthrough of the local MVP with the seeded demo business, Harbour Bean Café. Everything runs locally: no Instagram, Facebook, Zernio or paid AI calls.

## Before presenting

- [ ] `.env.local` has `SOCIAL_PROVIDER_MODE=mock` (approving a reply or posting then goes to the in-app mock, not Zernio). Remove it again before a live session.
- [ ] Local Supabase is running (`supabase start`) and the app is running (`pnpm dev`).
- [ ] Run `pnpm demo:seed` for a fresh demo (run it again between rehearsals; it only touches the demo business).
- [ ] Sign in at http://localhost:3000/login as **owner@example.com** / **password123**.
- [ ] jevos (local Jev) is **not** needed: every demo message is already sorted.
- [ ] Optional: close other tabs, zoom the browser to 110–125% so the room can read it.

## 1. Sign in (0:00)

**Click:** sign in as owner@example.com. You land on **Inbox**.

**Say:** "This is Harbour Bean Café, a small café in Cubao. Every comment and DM from their Instagram and Facebook lands in one inbox, and the receptionist has already written a reply from the café's own business info."

## 2. The inbox (0:30)

**Click:** nothing yet. Point at the **To approve** tab, the list on the left and the open card on the right.

**Say:** "The customer who has waited longest is at the top. Each message shows who sent it, where, and what kind of message it is. On the right: the customer's message, the suggested reply, and the facts it used: here, 'Payments'. It never makes up prices or promises. The keyboard hints are for owners who handle a lot of messages: A to approve, E to edit, J for the next one."

## 3. Approve a reply (1:00)

**Click:** on Paolo Cruz's "Tumatanggap kayo ng GCash?", press **A** (or click **Approve and send**). The card turns into "Sent to Paolo Cruz · Undo".

**Click:** **Undo**. The card comes back. Press **A** again and let it go.

**Say:** "One key and it's sent. There's an eight-second undo, like in email, in case you approve the wrong one."

## 4. Edit before sending (1:30)

**Click:** select Bea Santos's DM about bringing a cake. Press **E**, add "See you po!" at the end, then press **A**.

**Say:** "Owners can tweak a reply in their own voice before it goes out. Taglish is fine, both in what customers write and in the replies."

## 5. A lead (2:00)

**Click:** select Carlo Mendoza's DM (the coral **Lead** label). Then open **Leads** in the sidebar.

**Say:** "Carlo wants a table for 8 on Saturday. That's a lead: a booking, an order or a quote request. The receptionist saves his name, number and request, and the owner gets an email. Every lead links back to the conversation."

## 6. Messages that need the owner (2:30)

**Click:** **Inbox** → **Needs you**. Show three of them:

- **jen.dc** (amber **Complaint**): "Complaints always come to you. The receptionist never answers them on its own."
- **Liza Tan**: "This one shows what happens when something can't be sent: Instagram's 24-hour reply window closed before the reply went out. It says why and how to fix it: copy the reply, answer on Instagram, mark it as handled."
- **aisha.k** ("Is your kitchen halal certified?"): "The business info doesn't cover this, so it asks the owner instead of guessing."

## 7. Notifications (3:15)

**Click:** the **bell** at the top of the sidebar.

**Say:** "Everything that needs you is here too: the new lead, the messages waiting for you, and updates like 'replies sent automatically' and posts that went live. The violet number only counts things that need you. Opening an item clears its dot."

**Click:** close the panel.

## 8. The trail behind a reply (3:45)

**Click:** **Inbox** → **Sent** → kenji.o's oat milk question → **Open the conversation** → expand **History and costs**.

**Say:** "Every reply can be traced: when it came in, how it was sorted, the draft, who approved it, when it was sent. And what the AI behind it cost, a fraction of a cent per message."

## 9. Posts (4:15)

**Click:** **Posts**. Type a short post (for example "Fresh croissants out of the oven!"), keep **Post now**, click **Post now**.

**Say:** "The same app publishes posts. Below: a weekend post scheduled for tomorrow, which you can cancel, and one that couldn't go out while posting was paused, with a button to pick a new time."

## 10. Settings and business info (4:40)

**Click:** **Settings** → the **Replies** section. Then **Business info**.

**Say:** "The owner decides how much the receptionist does: for questions and leads, Off, Ask me first, or Auto-send. Complaints and unclear messages always come to the owner. And this is the business info: hours, prices, policies. It's the only thing the receptionist is allowed to use in a reply."

## Close (5:00)

**Say:** "So: messages answered in minutes from your own facts, leads captured, complaints and anything unusual handed to you. You stay in control."

## If something looks off

- A list is empty or a step is already done: run `pnpm demo:seed`, then reload the page.
- You're signed out: sign in again as owner@example.com / password123.
- An approved reply stays under **Sent** as "Sending now" for a few seconds: that's the undo window; it moves to sent right after.
