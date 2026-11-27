# Demo script: showing AI Office (10 minutes)

For the person presenting AI Office on the Mac Studio. What to say is in *italics* (Vietnamese, as said aloud); what to click is in **bold**. Screen labels are quoted exactly as they appear.

## Before the visitor arrives (5 minutes)

1. Open https://cubewin07.github.io/Dashboard-N8N-tasks/ in Chrome. Log in with the boss account.
2. Check the badge at the top right. It must say "Trực tuyến" (green). "Đang kết nối…" for more than a few seconds means the network: reload once.
3. Open **Cài đặt → Chất lượng hình 3D**. Leave it on automatic. On an older laptop, pick a lower level.
4. Go back to **Văn phòng** and wait for "Đang dựng văn phòng… 100 %" to disappear. The first load downloads a few MB; later loads come from the cache.
5. If the scene was used before, open **Bộ điều khiển mô phỏng** (top right of the scene) and press **Đặt lại**. You start from a fresh company.
6. Optional second screen: the boss's phone, logged in as boss, on **Duyệt**.

## Part 1: the guided tour (5 minutes)

**Chế độ trình diễn** (button above the scene). The tour runs 13 scenes by itself with captions. You only need to talk over it.

| Scene | What happens | What to add |
|---|---|---|
| 1 Toàn cảnh | The whole building | *Mỗi tầng là một phòng ban, mỗi người là một nhân viên AI. Tầng trên cùng là của Sếp.* |
| 2–3 Quản lý, CSKH | A request is split, then followed to a desk | *Sếp nhắn một câu, Quản lý tự chia việc cho đúng phòng.* |
| 4 Bàn làm việc | Rings, desk colours, platform badges | *Nhìn là biết ai đang làm, ai đang chờ, việc của sàn nào.* |
| 5–7 Chồng giấy, thang máy | Reviews pile up; a big decision rides up to the boss | *Việc lớn mới lên tới Sếp; việc nhỏ trưởng phòng tự duyệt.* |
| 8 Giờ cao điểm | 12.12 rush, the waiting seats fill | *Ngày sale, khách dồn dập vẫn có người xếp hàng xử lý.* |
| 9 Nhờ hỗ trợ | Marketing asks Thiết kế for help | *Phòng này nhờ phòng kia, giống công ty thật.* |
| 10 Nghỉ trưa | Naps, stairs to Giải trí | *Có giờ nghỉ, có tầng giải trí.* |
| 11 Nhân viên tạm | Temp staff arrive, then leave | *Đông việc thì thuê thêm, hết việc thì cho về, có giới hạn trong Quản trị.* |
| 12–13 Tủ đồ, kết thúc | Wardrobe hint, then back to the start | *Mời Sếp tự tay duyệt một việc.* |

Keys during the tour: **Space** pauses, **→** skips to the next scene, **Esc** leaves. When it ends, the camera and the simulator return to where they were.

## Part 2: hands-on (4 minutes)

1. **Duyệt** (on the phone, or in the sidebar): on the tab "Chờ sếp duyệt", pick the top item and press **Duyệt**. *Trên Mac, chồng giấy trên tầng Sếp vơi đi một tờ.*
2. In the box **Nhắn cho quản lý…**, type *Làm banner sale 12.12 cho Shopee 1* and press **Gửi yêu cầu**. Back in **Văn phòng**, the Quản lý gets it, and a few seconds later a desk in Thiết kế or Marketing lights up.
3. **Nhân sự** (left of the scene, under "Các tầng"; open it if collapsed): click anyone to follow them. The camera follows that person between floors. Press **Esc** to return to the overview.
4. **Tủ đồ**: change one person's shirt colour and save. *Bộ mới hiện ngay trong toà nhà.*
5. If there is time, open **Quản trị → Phòng ban**. *Thêm một phòng là có thêm một tầng, không cần lập trình.* Don't save unless you mean it: it changes the real configuration.

## Part 3: one minute to close

*Bây giờ "bộ não" là mô phỏng chạy trong trình duyệt. Bước tiếp theo là thay bằng nhân viên AI thật; toà nhà và các màn hình giữ nguyên.* If asked what comes next, open `docs/plan/after-this-phase.md` §11.

## If something goes wrong

| What you see | Do this |
|---|---|
| Badge "Mất kết nối", red banner | Check Wi-Fi. It reconnects by itself; nothing is lost. |
| "Cảnh 3D tạm dừng…" | Wait a few seconds; it rebuilds itself. If "Tải lại cảnh" appears, press it. |
| The scene is slow or stutters | **Cài đặt → Chất lượng hình 3D** one level lower; close other heavy tabs. |
| Nothing moves | Simulator paused: in **Bộ điều khiển mô phỏng**, set **Tốc độ** to 1×. |
| The company looks "used" (huge piles, many temps) | **Bộ điều khiển mô phỏng → Đặt lại**. |
| The tour seems stuck on a scene | Press **→**. A scene waits for its event for at most its own length anyway. |
| Something odd on screen | **Cài đặt → Giới thiệu → Chẩn đoán** shows the version and any skipped events; send a screenshot of it. |
| Login fails | Check the caps lock; the password reset is in the runbook (`runbook-supabase.md`). |
| Two Mac tabs open | Fine: they share one company. Close the extra tab anyway; a hidden tab runs the simulation slower. |

On a phone, the 3D scene is off by default. **Xem 3D (thử nghiệm)** turns it on after a warning; **Xem danh sách 2D** turns it off again.
