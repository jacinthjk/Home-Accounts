# Home Accounts – your private home account book (வீட்டுக் கணக்கு)

Works on **computers and mobile phones**, in **English and தமிழ்**.

📱 **Open the app:** <https://jacinthjk.github.io/Home-Accounts/>
(Open it on a phone and choose "Add to Home screen" to install it.)

## Your account 👤 (mobile number + password)
Everyone signs up once with their **mobile number**, which is their login, and a password.
1. Open the app and choose **English** or **தமிழ்** at the top.
2. Under **Create your account**, type your name, choose your country code (🇮🇳 +91 is already chosen) and type your mobile number. Then choose your currency and a password. A short phrase you remember works well, for example *mango tree 1984*.
3. You will see a **recovery code**. **Write it on paper and keep it safe.** If you forget your password, this code is the only way back into your account.

**On another phone, tablet or computer:** open the app, tap **I already have an account – Log in**, then type the same mobile number and password. All your accounts appear there and **stay in sync on all your devices**, both ways.

- **Forgot your password?** On the login screen tap **Forgot password? Use recovery code**. Type your mobile number, your recovery code and a new password.
- **Changing your password** (Settings → Change password) changes it for all your devices.
- **Sign out of a device** you no longer use: **Settings → Your account → Sign out of this device**. Your accounts stay safe in your account.
- **Delete my account** (Settings, at the bottom) removes your account and everything in it from the cloud for good.
- **No internet?** Every device keeps working offline and opens with your password. Changes are sent when the connection returns. Creating an account and logging in on a new device need internet.

**Privacy.** Your password never leaves your device. The app turns it into two different keys: one to sign in, and one that unlocks your data, which is never sent anywhere. Everything is encrypted on your device before it goes to the cloud, so the cloud cannot read your expenses, income, names or amounts. Only your mobile number is visible to the cloud, because it is your login.

## Using it on a phone 📱
Open **<https://jacinthjk.github.io/Home-Accounts/>** on the phone, then install it:
- **Android (Chrome):** tap the **⋮** menu, then **Install app** or **Add to Home screen**. You can also use **Settings → Install the app** inside Home Accounts.
- **iPhone (Safari):** tap the **Share** button ⬆️, then **Add to Home Screen**.

It gets its own icon, opens full-screen like any other app, and works without internet.

## Family sharing 👨‍👩‍👧
Share one account book with your family. Everyone adds their own daily expenses from their own phone, with their own account. Changes show up on everyone's devices within seconds. The family's totals, budgets, warnings and reports include everyone.

| Role | Can do |
|---|---|
| 👑 **Owner** (whose account book it is) | Everything, plus invite and remove people |
| **Can add & edit everything** | Add, change and delete anyone's entries, items and budgets |
| **Can add & edit own expenses** | Add expenses and income, and change or delete only what they added. Everyone else's entries are shown with 🔒. |

Each entry shows who added it ("👤 Added by Priya"). **Reports → Spending by family member** shows who spent what.

**Inviting someone**
1. **Settings → Family sharing → Invite a family member.** Choose what they may do, then tap **Create invite**.
2. Tap **Send** (or **Copy**) and send it **privately** to that one person, for example in WhatsApp. An invite works **once** and expires in **48 hours**.
3. They create their own account (or log in), then open the link, or go to **Settings → Family sharing → Join another family** and paste it. Their existing entries are added to the family book. All their devices follow automatically.

**Good to know**
- The ☁️ button at the top shows the sync status. Tap it to sync now.
- The owner can change someone's permission or **remove** them (✎ next to their name). Removed people stop seeing new entries, and what they already added stays. They carry on with their own account book.
- **Leave the family book** returns you to your own account book with your own entries.
- Permissions are checked by the cloud itself, so a member cannot get around them.

## Setting up the cloud ☁️ (one time, for the person who runs the app)
Accounts live in a free **Supabase** project. Everyone who uses the app shares it, and nobody else needs to do anything technical.
1. Go to <https://supabase.com>, create a free account, and click **New project**. Choose a region near your users (for India: *Mumbai*) and any database password.
2. Open **SQL Editor → New query**. Paste the whole contents of **cloud-setup.sql** from this folder and click **Run**. It is safe to run again; run it again whenever it is updated.
3. Open **Authentication → Sign In / Providers → Email**:
   - keep **Email** enabled and **Allow new users to sign up** on;
   - turn **Confirm email** **OFF**. The app makes a sign-in address from the mobile number, such as 919876543210@phone.home-accounts.app, and no email is ever sent.
   - You can leave **Anonymous sign-ins** off; it is no longer used.
4. Open **Project Settings → API Keys** and copy the **Project URL** and the **Publishable key** (or the older "anon public" key).
5. Put both into the file **config.js** in this folder, and publish the files again.

Notes:
- The free plan suits a few hundred users. It **pauses** after about a week with no use; if that happens, open the Supabase dashboard and click **Restore project**. Nothing is lost. A busier app may need the paid plan.
- Mobile numbers are not verified by SMS. Anyone could sign up with a number they do not own, but that number then belongs to that account. Real SMS checks can be added later with a paid SMS provider.

## Language / மொழி 🌐
Tap **English / தமிழ்** on the login screen, the **அ / A** button at the top, or **Settings → Language**.
- All screens, warnings and messages change language.
- Standard item names (அரிசி, பால், முட்டை…) are shown in Tamil, with the English name in small letters underneath.
- Items you add yourself keep the name you typed.

## Every day – the Daily Ledger 📒
- Each date has its own ledger page. Use ◀ ▶ to move between days, or pick a date.
- Tap **+** to add and **−** to remove. The amount is worked out for you, for example 2 L × ₹60 / L = ₹120.
- Choose the **unit** in the box under the + button: kg, g, L, ml, pcs, dozen, packet, bottle, box, bundle, metre or each.
  - Units of the same kind convert automatically. For example, 500 g of rice at ₹60 / kg = ₹30, and 1 dozen eggs at ₹7 / pcs = ₹84.
  - For a different kind of unit (for example sugar by **packet** instead of kg), the app asks the price of one packet.
  - The app remembers the unit you chose for next time.
  - **+** adds 1 kg, 1 L, 1 pcs and so on, or 100 at a time for g and ml.
- Tap the **number** to type an exact quantity, such as 1.5 or 250.
- Tap the **price** to change it for that day, for example when vegetables cost more.
- **Bought today** shows only what you bought that day.
- **Other expense** is for one-time costs, such as a plumber.
- **Copy items from an earlier day** repeats a regular shopping list.

## Planner 📅 (yearly planner & monthly pre-planner)
Tap **📅 Planner** in the menu.
- **The year:** all 12 months are shown at once. Each month shows what you **planned** and what you **spent**, with a coloured bar, and any payments still to make or overdue. This month is highlighted. Use ◀ ▶ to change the year.
- **Tap a month** to plan it in advance:
  - **Planned payments & purchases:** things to pay or buy that month, such as school fees, rent, a gas cylinder or festival shopping, with an optional due date. **Tick** one when it is paid and it is added to the daily ledger automatically. Untick it to take it back out.
  - **Plan for each type of expense:** how much you want to spend on Groceries, Bills and so on. Tap **➕ Plan** to set an amount, **✎** to change it and **🗑** to delete it. Planned payments count towards their type and stay when you delete a plan.
  - **Expected income** and **notes for the month** (for example "Diwali on the 8th").
  - **Copy last month's plan** or **Use my usual budgets** to fill it in quickly.
- The app reminds you on **Home** when a planned payment is due in the next 3 days or is overdue, and warns you when you spend more than planned.

## Loans 🏦
Tap **🏦 Loans** in the menu to keep track of money you have to repay: to people, banks, jewel loans or anything else.
- **Add a loan:** choose the type, who it is from, the amount and the date it was taken. You can add a note, such as the interest rate or what was pledged.
- **Add repayment** each time you pay. The app shows the **loan amount, how much is repaid and the balance to repay** for each loan, plus the totals at the top. When the balance reaches zero the loan moves to **Fully repaid**.
- A repayment is also added to the daily ledger as an expense, so your spending and savings stay correct. Untick the box if you do not want that.
- Open **Repayments** under a loan to see the history. Tap one to change or delete it.
- **Interest is not calculated.** The balance is simply the loan amount minus repayments. If interest adds to what you owe, use **Edit loan** to change the loan amount.

## Speak your expenses 🎤
Tap **🎤 Speak your expenses** on the Daily Ledger, or **🎤 Speak** on Home, then just talk. For example:

> *"2 kg rice, 1 litre milk, bread 45 rupees, plumber 500"*
>
> *"2 கிலோ அரிசி, அரை கிலோ தக்காளி, பால் 60 ரூபாய், கரண்ட் பில் 1850"*

- Choose **தமிழ்** or **English** at the top of the voice window, depending on the language you will speak.
- In Tamil you can say numbers as words (ரெண்டு, அரை, ஒன்றரை, நூற்றி ஐம்பது) and use everyday words (கேஸ், கரண்ட் பில், ஆட்டோ). Endings like அரிசிக்கு or பாலும் are understood too.

- Pause between items. The app stops listening by itself after a few seconds of quiet, or you can tap **Done**.
- It lists what it understood. Untick anything wrong or change a number, then tap **Add**. The items appear on that day's ledger page.
- You can say quantities ("half kg", "a dozen", "500 grams"), amounts ("for 90 rupees", "₹300"), or both.
- Things that are not in your list, such as "plumber 500", are added as one-time expenses.
- The first time, the browser asks to use the microphone. Click **Allow**.
- **Privacy:** if your browser can turn speech into text on the computer itself, nothing is sent anywhere. Otherwise Chrome or Edge sends your voice to Google or Microsoft to be converted, and the app asks your permission before it does that. You can switch this off in **Settings → Voice entry**.
- You can also **type** the same kind of sentence instead of speaking. It works the same way and is completely private.

## Income 💰
Add salary, pension, business income and other money you receive. The app then works out your **savings**.

## Warnings and tips 🔔
Set a **monthly budget** in Settings. You can also set a budget for each type of expense, such as Groceries or Bills. The app warns you when:
- you have used 80% of a budget, or crossed it
- you are spending more than your income
- today's spending is much higher than usual
- you are spending more than usual on a particular item, such as Milk or Gas

## Keeping it private 🔐
- Everything is **encrypted** with your password and saved on this device (computer or phone). The app never sends your accounts over the internet, except to your own family cloud when you turn on **Family sharing**, and then only in encrypted form.
- The app **locks itself** after a few minutes of no use. Tap **🔒 Lock** to lock it straight away.
- Tap **👁️ Hide** to blur all amounts when someone is near your screen.
- Five wrong passwords in a row make the app wait before you can try again.

## Backups 💾 (important)
Your accounts are kept on each of your devices and, encrypted, in your account in the cloud. A backup file is an extra safety copy that you keep yourself.
- Go to **Settings → Make a backup** about once every two weeks. The app reminds you.
- The backup file is locked with your password. Copy it to a pen drive.
- On a phone, **Send backup** lets you save it straight to Google Drive or send it to yourself on WhatsApp.
- To use your accounts on another device, simply log in there with your mobile number and password. Backups are an extra safety copy.

**Notes**
- Printed reports and **Export to Excel** files are *not* password protected. Delete them when you are done.
- Use the same browser every time. Edge and Chrome keep separate data.

## For whoever looks after the app files
| File | What it is |
|---|---|
| `index.html` | the page that opens |
| `config.js` | the address of your cloud (Supabase) – fill in once |
| `app.js` | the app itself |
| `i18n.js` | Tamil translations (add or correct Tamil words here) |
| `styles.css` | look and layout for phone, tablet and computer |
| `manifest.webmanifest`, `sw.js`, `icons/` | let phones install the app and use it offline |
| `cloud-setup.sql` | one-time set-up for the family cloud (run in Supabase) |

After changing any file on the website, raise the `VERSION` number at the top of `sw.js` (for example `home-accounts-v5`). Installed phones then pick up the new version.
