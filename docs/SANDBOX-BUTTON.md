# Approve a hold with the real PayPal button (sandbox)

This is one manual step that can't be scripted: a sandbox buyer logs in to PayPal and approves a hold made with PayPal's
JS SDK v6 button. It takes about 5 minutes and moves only sandbox money.

## You need

- The sandbox keys in `api/.env` (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`). They are already there.
- A sandbox **personal** account to pay with. In the PayPal developer dashboard, go to Testing Tools → Sandbox Accounts.
  Open the personal account's ⋯ → View/Edit account to see its email and password.

## Steps

1. Start a second server on the real sandbox, on its own port and state folder. Leave 8810 alone.

       cd D:\paypal\done\api
       set PORT=8830& set PUBLIC_URL=http://localhost:8830& set DONE_STATE_DIR=D:\paypal\done\api\data\sandbox-button& node src\server.js

2. Open http://localhost:8830, choose **Sign in**, and sign up as a new customer. Pick a PIN and keep it.
3. Post a small job, for example "Kitchen faucet drips, under $200", and wait 1–2 minutes for offers.
4. Hire an offer. When you're asked how to hold the money, choose **PayPal (you approve once)**. The job is now
   "agreed", with the hold waiting for approval.
5. Open `http://localhost:8830/paypal/button?job=<the job's id>`. The id is in the job page's address, after
   `/jobs/`. The page loads PayPal's JS SDK v6 and shows the PayPal button.
6. Press the PayPal button. PayPal's window opens. Log in with the **sandbox personal** account's email and password,
   then approve. If no window opens, use the "Open PayPal's approval page" link on the page.
7. The page's log shows `approved by the buyer: <order id>` and then the hold's status. Go back to the job page: the
   money now shows as **held**, and the order and authorization ids are real sandbox ids. You can also look them up
   under Activity in the sandbox business account.

Only the person types the sandbox password, on PayPal's own page. VeriPay never sees it.

## Afterwards

Stop the second server (Ctrl+C). Its state folder `data\sandbox-button` can be deleted. For the record, add the order id
and authorization id to `docs/live-test/sandbox/runs.json`, or tell Claude and it will add them.
