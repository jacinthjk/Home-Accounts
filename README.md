# Home Accounts – your private home account book (வீட்டுக் கணக்கு)

Works on **computers and mobile phones**, in **English and தமிழ்**.

📱 **Open the app:** <https://jacinthjk.github.io/Home-Accounts/>
(Open it on a phone and choose "Add to Home screen" to install it.)

## How to open it on a computer
Double-click **index.html**. It opens in your web browser (Microsoft Edge or Google Chrome).
No internet, no sign-up and no installation are needed.

Tip: once it opens, press **Ctrl + D** to bookmark it so you can find it again easily.

## How to use it on a mobile phone 📱
A phone cannot open files from your computer's folder, so the app must be opened from a **secure web address (https://…)**.
Putting the app files online is safe: they contain **no accounts and no money details**. Your accounts are created and kept, encrypted, only on each phone.

**Step 1 – Put the app online (one time, free).** Use either option:
- **Netlify Drop (simplest):** go to <https://app.netlify.com/drop>, sign in with a free account, and drag this whole **Account Management** folder onto the page. You get an address like `https://something.netlify.app`.
- **GitHub Pages:** create a free GitHub account, make a new repository, upload all the files in this folder, then turn on *Settings → Pages*. You get an address like `https://yourname.github.io/home-accounts/`.

**Step 2 – Install it on the phone.** Open that address on the phone:
- **Android (Chrome):** tap the **⋮** menu, then **Install app** or **Add to Home screen**. You can also use **Settings → Install the app** inside Home Accounts.
- **iPhone (Safari):** tap the **Share** button ⬆️, then **Add to Home Screen**.

It now has its own icon, opens full-screen like any other app, and **works without internet**.

**Moving accounts between phone and computer.** Each device keeps its own locked copy. On the old device, go to **Settings → Make a backup**, or **Send backup** to share it through WhatsApp, Google Drive or email. On the new device, choose **Restore from a backup file**. The backup stays locked with your password the whole time.

## Family sharing 👨‍👩‍👧
Share one account book with your family. Everyone adds their own daily expenses from their own phone, and changes show up on everyone's phone within seconds. The family's totals, budgets, warnings and reports include everyone.

**What each person can do**
| Role | Can do |
|---|---|
| 👑 **Owner** (whoever starts the family book) | Everything, plus invite and remove people |
| **Can add & edit everything** | Add, change and delete anyone's entries, items and budgets |
| **Can add & edit own expenses** | Add expenses and income, and change or delete only what they added. Everyone else's entries are shown with 🔒. |

Each entry shows who added it ("👤 Added by Priya"). **Reports → Spending by family member** shows who spent what.

**Privacy.** Every entry is encrypted on the phone with a secret family key *before* it is sent. The cloud only stores scrambled text: no item names, no amounts, not even your family members' names. Permissions are checked by the cloud itself, so a member cannot get around them.

### One-time cloud set-up (owner, about 10 minutes, free)
1. Go to <https://supabase.com>, create a free account, and click **New project**. Choose a region near you (for India: *Mumbai*) and any database password.
2. When the project is ready, open **SQL Editor → New query**. Paste the whole contents of the file **family-sharing-setup.sql** from this folder and click **Run**.
3. Open **Authentication → Sign In / Providers** and switch on **Allow anonymous sign-ins**, then **Save**. (Family members don't need email accounts; each phone gets its own private sign-in.)
4. Open **Project Settings → API Keys**. Copy the **Project URL** (like `https://abcdxyz.supabase.co`) and the **Publishable key** (or the older "anon public" key).
5. In Home Accounts: **Settings → Family sharing → Start a family book**. Paste both, type your name, and tap **Start sharing**.

### Inviting family members
1. **Settings → Family sharing → Invite a family member.** Choose what they may do, then tap **Create invite**.
2. Tap **Send** (or **Copy**) and send it **privately** to that one person, for example in WhatsApp. An invite works **once** and expires in **48 hours**.
3. They open the link on their phone, or go to **Settings → Family sharing → Join a family** and paste it. Their existing entries are added to the family book.

### Using your accounts on several of your own devices 📱💻
Want the same accounts on your phone **and** your computer (or a tablet)? Once the family cloud is set up (above):
1. On the device you already use: **Settings → Family sharing → Link my other device → Create invite**. Send it to yourself, for example by email, or copy it.
2. On the other device: open the app at its web address, create a password for that device, then open the link, or go to **Settings → Family sharing → Join a family / link this device** and paste it.

That device now shows exactly the same accounts and **stays in sync both ways**, with full owner rights. Entries made on one device show on the other as "Added by your other device". If a device is lost or sold, tap ✎ next to it in the family list and choose **Unlink this device**. It is cut off at once.

> **Already ran the cloud set-up before October 30, 2026?** Run **family-sharing-setup.sql** in the Supabase SQL Editor once more. It is safe to repeat, and it adds device linking and month plans.

### Good to know
- Phones keep working **without internet**. Changes are sent automatically when the connection returns. The ☁️ button at the top shows the sync status; tap it to sync now.
- The owner can change someone's permission or **remove** them (✎ next to their name). Removed people stop seeing new entries. What they already added stays.
- A member who taps **Leave the family book** keeps only their own entries on their phone.
- The free Supabase plan **pauses** a project after about a week with no use. If syncing stops, open your Supabase dashboard and click **Restore project**. Nothing is lost.
- Keep making **backups**: the backup also keeps your connection to the family book. Restore it only on a phone that replaces an old one. To use a second device at the same time, use **Link my other device** instead.

## Language / மொழி 🌐
Tap **English / தமிழ்** on the login screen, the **அ / A** button at the top, or **Settings → Language**.
- All screens, warnings and messages change language.
- Standard item names (அரிசி, பால், முட்டை…) are shown in Tamil, with the English name in small letters underneath.
- Items you add yourself keep the name you typed.

## First time
1. Choose **English** or **தமிழ்** at the top.
2. Type your name (optional) and choose your currency.
3. Create a password. A short phrase you remember works well, for example *mango tree 1984*.
4. You will see a **recovery code**. **Write it on paper and keep it safe.** If you forget your password, this code is the only way to open your accounts.

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
  - **Plan for each type of expense:** how much you want to spend on Groceries, Bills and so on. Planned payments count towards their type.
  - **Expected income** and **notes for the month** (for example "Diwali on the 8th").
  - **Copy last month's plan** or **Use my usual budgets** to fill it in quickly.
- The app reminds you on **Home** when a planned payment is due in the next 3 days or is overdue, and warns you when you spend more than planned.

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
Your accounts are stored inside the browser. If the browser data is cleared or the computer is changed, they are lost unless you have a backup.
- Go to **Settings → Make a backup** about once every two weeks. The app reminds you.
- The backup file is locked with your password. Copy it to a pen drive.
- On a phone, **Send backup** lets you save it straight to Google Drive or send it to yourself on WhatsApp.
- To move to a new computer, copy this folder there, open index.html and choose **Restore from a backup file**.

**Notes**
- Printed reports and **Export to Excel** files are *not* password protected. Delete them when you are done.
- Use the same browser every time. Edge and Chrome keep separate data.

## For whoever looks after the app files
| File | What it is |
|---|---|
| `index.html` | the page that opens |
| `app.js` | the app itself |
| `i18n.js` | Tamil translations (add or correct Tamil words here) |
| `styles.css` | look and layout for phone, tablet and computer |
| `manifest.webmanifest`, `sw.js`, `icons/` | let phones install the app and use it offline |
| `family-sharing-setup.sql` | one-time set-up for the family cloud (run in Supabase) |

After changing any file on the website, raise the `VERSION` number at the top of `sw.js` (for example `home-accounts-v5`). Installed phones then pick up the new version.
