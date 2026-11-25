# Runbook: Supabase for AI Office (P09)

Human steps to connect the live app to Supabase. About 20 minutes. Do them in order.

**Never paste a key, password or token into chat, an issue, a PR or a commit.** The app only ever needs the **Project URL** and the **publishable (public) key**. The `secret` / `service_role` key and the database password are never copied anywhere except your password manager.

> Dashboard labels move from time to time. Each step names the section and the setting, so you can still find it if a button has a new name.

---

## 0. What you need
- A Supabase account (supabase.com), free plan is enough.
- On the Mac: Homebrew and **Docker Desktop** (only needed for running the database tests locally; the app itself does not need Docker).

## 1. Create the project (done 2026-11-26)
1. supabase.com → **New project**.
2. Name `ai-office`, region **Southeast Asia (Singapore)**.
3. Generate a database password and save it in your password manager. You need it once, in step 4.

## 2. Turn off sign-up and set the redirect URLs
1. Dashboard → **Authentication** → **Sign In / Providers**.
   - **Email**: enabled.
   - **Allow new users to sign up**: **off**. (Accounts are created by you in step 3.)
   - **Confirm email**: can stay on; the users you create in step 3 are confirmed by hand.
2. Dashboard → **Authentication** → **URL Configuration**.
   - **Site URL**: `https://cubewin07.github.io/Dashboard-N8N-tasks/`
   - **Redirect URLs** → **Add URL**: `http://localhost:5173/Dashboard-N8N-tasks/` (for testing on the Mac). Also add `https://cubewin07.github.io/Dashboard-N8N-tasks/` if it is not listed already.
   - Save.

## 3. Create the three accounts
Dashboard → **Authentication** → **Users** → **Add user** → **Create new user**, three times:

| Who | Email | Role (step 5) | Avatar in the building |
|---|---|---|---|
| Dad | dad's email | `boss` | `emp_giam_doc` (Giám đốc) |
| You | your email | `boss` | `emp_pho_giam_doc` (Phó giám đốc) |
| Sister | sister's email | `stylist` | none |

For each: type the email and a password, tick **Auto Confirm User**, then **Create user**. Give each person their own password privately (not in a shared chat).

## 4. Push the database schema (terminal on the Mac)
Do this from the repo folder, on the branch that contains `supabase/migrations/` (the P09 branch, or `main` after merge).

```bash
brew install supabase/tap/supabase   # once
supabase login                       # opens the browser, once
supabase link --project-ref <your-project-ref>
#   the ref is the part of the Project URL before .supabase.co
#   it asks for the database password from step 1: type it in the terminal, never paste it in chat
supabase db push
#   shows the migrations it will apply (0001 … 0005) and asks to confirm: answer y
```

Check: Dashboard → **Table Editor** shows `departments`, `employees` (28 rows), `appearances` and the other tables. Every table shows the **RLS enabled** label.

Do **not** run the tests against this project (`supabase test db --linked`). The tests create fake users; they run only on the local Docker copy (`npm run db:start && npm run db:test`) and in CI.

> If `supabase start` (local) fails with "failed to pull … postgrest:v17.1 not found": delete the file `supabase/.temp/rest-version` and run it again. `supabase link` saved a version hint for which no public image exists. Nothing breaks by deleting it.

## 5. Give the three accounts their roles
An account without a role can log in to Supabase but the app signs it out at once ("Tài khoản này chưa được cấp quyền vào ứng dụng. Hãy liên hệ sếp.").

Dashboard → **SQL Editor** → **New query**, paste this, replace the three emails, **Run**:

```sql
insert into public.app_users (user_id, role, display_name, owner_employee_id)
select u.id, v.role::public.app_role, v.display_name, v.owner_employee_id
from (values
  ('DAD_EMAIL@example.com',    'boss',    'Giám đốc',     'emp_giam_doc'),
  ('YOUR_EMAIL@example.com',   'boss',    'Phó giám đốc', 'emp_pho_giam_doc'),
  ('SISTER_EMAIL@example.com', 'stylist', 'Stylist',      null)
) as v(email, role, display_name, owner_employee_id)
join auth.users u on lower(u.email) = lower(v.email)
on conflict (user_id) do update
  set role = excluded.role,
      display_name = excluded.display_name,
      owner_employee_id = excluded.owner_employee_id;

select u.email, a.role, a.display_name
from public.app_users a join auth.users u on u.id = a.user_id;
```

The last `select` must list exactly three rows. If one is missing, the email does not match step 3 exactly.

To remove someone later: `delete from public.app_users where user_id = (select id from auth.users where email = '…');` (their looks and config stay).

## 6. Put the public values into the app
Dashboard → **Project Settings** → **API Keys** (older dashboards: **API**).
- **Project URL**: on the project home page or **Project Settings → Data API**.
- **Publishable key** (`sb_publishable_…`). On older projects use the **anon public** key under "Legacy API keys". Either works.
- **Never** copy the **secret** key (`sb_secret_…`) or the **service_role** key.

a) On the Mac, file `.env.local` in the repo folder (it is git-ignored):
```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```
(`VITE_SUPABASE_PUBLISHABLE_KEY` works too, as an alias.) Restart `npm run dev` after editing it. With these values set, the app needs the schema from step 4; without them it runs the offline demo.

b) For the live site: GitHub → repo **Settings** → **Secrets and variables** → **Actions** → tab **Variables** (not Secrets) → **New repository variable**, twice:
- `VITE_SUPABASE_URL` = the Project URL
- `VITE_SUPABASE_ANON_KEY` = the publishable key

These are public values (they end up in the browser anyway), which is why they go under Variables.

## 7. Deploy and test
1. GitHub → **Actions** → **Deploy** → **Run workflow** (on `main` once P09 is merged).
2. Open https://cubewin07.github.io/Dashboard-N8N-tasks/ and tick the checklist:
   - [ ] Logged out: only the login page shows; there is no sign-up link.
   - [ ] Wrong password → "Email hoặc mật khẩu không đúng".
   - [ ] Dad logs in → the office, with the boss menu.
   - [ ] Sister logs in on her phone → only "Tủ đồ" (wardrobe). Typing `#/admin` in the address bar lands on the wardrobe.
   - [ ] Sister changes Linh's hair and saves → on the Mac (dad logged in), Linh's hair changes within a second or two, no refresh.
   - [ ] Two people edit the same person's look at the same time → the second to save sees "Người khác vừa đổi diện mạo này" with **Tải lại** / **Ghi đè**.
   - [ ] Settings → "Nhập diện mạo từ trình duyệt này" → **Nhập diện mạo** (boss only) moves the looks saved in this browser before P09 to the server, once, and lists the result per employee ("Đã nhập", "Đã có sẵn, giữ nguyên", "Không nhập được").
   - [ ] "Quên mật khẩu?" sends an email; the link opens the app's reset page and the new password works. Open the link **in the same browser** that asked for it (the secure link flow keeps a one-time code in that browser); on another device it shows an error, so just ask again from there.
   - [ ] Turn Wi-Fi off and on: the live badge shows "Mất kết nối" or "Đang kết nối lại…", then "Trực tuyến" again, and nothing needs a refresh.

The "Bản demo" badge in the header stays: the people and looks are real data now, but the activity is still simulated.

Remember: each browser runs its own simulator, so two people see the **same people and looks** but **different activity**. That is expected until the real worker exists.

## 8. Keep-alive and pausing
Free projects pause after about 7 days with no activity. Opening the app counts as activity. **Open the app the day before you show it to anyone.** If it is paused: dashboard → the project → **Restore project** (takes a few minutes).

## 9. Later schema changes
New migrations arrive as files `supabase/migrations/0006_…sql` in a PR. After the PR is merged: `git pull`, then `supabase db push` again. Migrations already applied are never edited, only added.

## 10. Security checks (once after setup)
- Dashboard → **Advisors** → **Security Advisor** → no RLS warnings for the `public` tables.
- Dashboard → **Authentication → Sign In / Providers**: sign-up still off.
