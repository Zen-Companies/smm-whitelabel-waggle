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

**Say:** "This is Harbour Bean Café, a small café in Cubao. Every comment and DM from their Instagram and Facebook lands in one inbox, and Waggle has already written a reply from the café's own business info."

## 2. The inbox (0:30)

**Click:** nothing yet. Point at the headline ("4 things need you" and the gray line about today), the **For you** tab, the list on the left (a honey dot means it needs the owner) and the conversation on the right.

**Say:** "The customer who has waited longest is at the top. Each message shows who sent it, where, and what kind of message it is. On the right: the customer's message, the suggested reply, and the facts it used: here, 'Payments'. It never makes up prices or promises. The keyboard hints are for owners who handle a lot of messages: A to approve, E to edit, J for the next one."

## 3. Approve a reply (1:00)

**Click:** on Paolo Cruz's "Tumatanggap kayo ng GCash?", press **A** (or click **Approve and send**). The card turns into "Answered Paolo Cruz · Undo", with the honey figure-8 trail tracing once next to the check.

**Click:** **Undo**. The card comes back. Press **A** again and let it go.

**Say:** "One key and it's sent. There's an eight-second undo, like in email, in case you approve the wrong one."

## 4. Edit before sending (1:30)

**Click:** select Bea Santos's DM about bringing a cake. Press **E**, add "See you po!" at the end, then press **A**.

**Say:** "Owners can tweak a reply in their own voice before it goes out. Taglish is fine, both in what customers write and in the replies."

## 5. A lead (2:00)

**Click:** select Carlo Mendoza's DM ("Lead · reply ready" under the message). Then open **Leads** in the top bar.

**Say:** "Carlo wants a table for 8 on Saturday. That's a lead: a booking, an order or a quote request. Waggle saves his name, number and request, and the owner gets an email. Every lead links back to the conversation."

## 6. Messages that need the owner (2:30)

**Click:** **Inbox** → stay on **For you** (messages handed to the owner sit with the replies to approve). Show three of them:

- **jen.dc** ("Complaint · for you to answer"): "Complaints always come to you. Waggle never answers them on its own."
- **Liza Tan**: "This one shows what happens when something can't be sent: Instagram's 24-hour reply window closed before the reply went out. It says why and how to fix it: copy the reply, answer on Instagram, mark it as handled."
- **aisha.k** ("Is your kitchen halal certified?"): "The business info doesn't cover this, so it asks the owner instead of guessing."

## 7. Notifications (3:15)

**Click:** the **bell** in the top bar.

**Say:** "Everything that needs you is here too: the new lead, the messages waiting for you, and updates like 'replies sent automatically' and posts that went live. The honey dot only lights up for things that need you. Opening an item clears its dot."

**Click:** close the panel.

## 8. The trail behind a reply (3:45)

**Click:** **Inbox** → **Answered** → kenji.o's oat milk question. Point at **Activity** on the right.

**Say:** "Every reply can be traced, in plain words: when it came in, what kind of message it was, which of your business info the reply was written from, who approved it, when it was sent." (What the AI cost per message is on the operator's Costs page, not in the owner's view.)

## 9. Posts (4:15)

**Click:** **Posts**. Type a short post (for example "Fresh croissants out of the oven!"), keep **Now**, click **Post now**.

**Say:** "The same app publishes posts, on a calendar: you see at a glance which days have a post. A post scheduled for tomorrow sits on its day, and the honey line says one couldn't go out while posting was paused, with a button to pick a new time. Click any empty day to plan a post for it."

## 10. Settings and business info (4:40)

**Click:** **Settings** → the **Replies** section. Then **Business info**.

**Say:** "The owner decides how much Waggle does: for questions and leads, Off, Ask me first, or Auto-reply. Complaints and unclear messages always come to the owner. And this is the business info: hours, prices, policies. It's the only thing Waggle is allowed to use in a reply."

## Close (5:00)

**Say:** "So: messages answered in minutes from your own facts, leads captured, complaints and anything unusual handed to you. You stay in control."

## If something looks off

- A list is empty or a step is already done: run `pnpm demo:seed`, then reload the page.
- You're signed out: sign in again as owner@example.com / password123.
- An approved reply stays under **Sent** as "Sending now" for a few seconds: that's the undo window; it moves to sent right after.
