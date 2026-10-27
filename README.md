# Discord bot điểm danh bang hội — DuyDinh

Deploy automatically from GitHub Actions to a VPS: [deployment setup and checklist](docs/deployment.md).

Bot Node.js 22+ dùng discord.js v14 để đăng ký nhân vật, tạo sự kiện và điểm danh qua Embed/buttons. Toàn bộ dữ liệu được lưu trên máy chạy bot bằng JSON; không cần Google Sheets, database server, hoặc dịch vụ lưu trữ bên ngoài.

## Tính năng

- Hỗ trợ nhiều Discord server. Không có `GUILD_ID` cố định; commands được đăng ký global.
- Mỗi guild có cấu hình, hồ sơ thành viên, sự kiện, bảng phái và điểm danh riêng.
- `/setup` chọn role thành viên, kênh đăng bảng và role quản trị riêng cho guild.
- `/event-create` mở thêm sự kiện dù đã có sự kiện khác đang mở. `/event-edit`, `/event-close` và `/event-delete` yêu cầu nhập đúng tên sự kiện. `/refresh` khôi phục các bảng đang mở.
- `/register` hoặc nút **Nhân vật** mở một form gồm tên, phái, và lựa chọn Cửu Vĩ Thần Cung hoặc Khách Scrim. Hồ sơ được giữ theo server và có thể cập nhật lại.
- Với từng sự kiện, chọn ✅ Có mặt, ⏰ Đến muộn hoặc ❌ Vắng mặt để điểm danh. Nút **Đăng ký tham gia** dùng khi chưa muốn chọn trạng thái.
- Sự kiện mới không kế thừa người tham gia hay vote từ sự kiện cũ. Người đã tạo hồ sơ vẫn cần đăng ký tham gia lại ở từng sự kiện.
- Bảng tách riêng số người **Chưa xác nhận** (đã đăng ký sự kiện nhưng chưa chọn trạng thái) và **Chưa đăng ký** sự kiện. Danh sách theo phái chỉ hiển thị người đã đăng ký sự kiện đó.
- `/member-info` tra hồ sơ; `/help` hiển thị hướng dẫn.
- Khi bot khởi động hoặc được thêm vào guild, các bảng sự kiện đã lưu sẽ được đồng bộ/khôi phục. Nếu tin nhắn bảng đã bị xóa, bot gửi lại và lưu `messageId` mới.
- Event giữ `guildId`, `channelId` và `messageId`. Chỉ các sự kiện trong guild nhận interaction mới được phép đồng bộ ở guild đó.

## Chọn lưu trữ JSON

MVP này chọn JSON vì không có dịch vụ ngoài hoặc phần mở rộng native cần cài đặt, chạy nguyên bản trên Windows, và dữ liệu dự án hiện phù hợp với mức độ ghi/đọc của bot. Ghi file qua file tạm rồi đổi tên để tránh để lại JSON ghi dở khi tiến trình gặp sự cố. Các use case ghi được serialize theo guild trong một tiến trình.

- `data/configs.json`: cấu hình `channelId`, `roleId`, `adminRoleId` cho từng `guildId`.
- `data/guild-data.json`: hồ sơ, sự kiện, điểm danh và danh sách phái theo từng `guildId`.

Hai file dữ liệu được `.gitignore` loại khỏi Git. Hãy backup định kỳ và không chia sẻ chúng công khai; trong đó có ID Discord và thông tin nhân vật. Chỉ chạy **một tiến trình bot** trên cùng thư mục dữ liệu: JSON không cung cấp transaction/khóa liên tiến trình như SQLite.

## Trách nhiệm các class

| Class | Trách nhiệm |
|---|---|
| `Member`, `GuildEvent`, `AttendanceRecord` | Các thực thể dữ liệu thuần; không phụ thuộc Discord hoặc lưu trữ. |
| `ClassRegistry` | Nguồn duy nhất về tên, emoji và thứ tự các phái. |
| `RegistrationService` | Xác thực quyền, tạo/cập nhật hồ sơ theo guild và làm mới roster. |
| `EventService` | Tạo, sửa, đóng, tìm sự kiện; chỉ cho phép một sự kiện mở trong mỗi guild và giữ lại lịch sử. |
| `AttendanceService` | Đăng ký người chơi riêng cho từng sự kiện, đặt trạng thái ban đầu là `Chưa xác nhận`, rồi cập nhật vote; kiểm tra role, hồ sơ và trạng thái sự kiện. |
| `PermissionService` | Xác thực quyền Manage Server/Administrator hoặc role quản trị và role thành viên của đúng guild. |
| `WriteQueue` | Tuần tự hóa thao tác đọc-sửa-ghi trong từng guild ở một tiến trình. |
| `JsonGuildDataStore` | Đọc/ghi dữ liệu guild trong JSON, giữ riêng các collection của từng guild. |
| `JsonGuildTableRepository` | Adapter repository cho thành viên, sự kiện và điểm danh; thực hiện `list`/`saveAll`. |
| `JsonGuildClassRosterRepository` | Thay thế roster phái suy ra từ hồ sơ thành viên. |
| `JsonGuildConfigRepository` | Lưu role và channel cấu hình theo guild; không chứa token. |
| `AtomicJsonFile` | Parse object JSON, ghi file tạm rồi thay thế file đích; báo lỗi nếu dữ liệu hỏng. |
| `AttendanceEmbedBuilder` | Dựng Embed tóm tắt, danh sách theo phái và buttons từ dữ liệu đã đọc. |
| `DiscordMessageService` | Gửi/sửa/khôi phục bảng, lưu message ID và bảo đảm channel thuộc đúng guild. |
| `DiscordInteractionAdapter` | Chuyển slash command, modal, menu và button thành lời gọi application service và phản hồi Discord. |
| `createApplication` (`src/app.js`) | Composition root: khởi tạo client, repositories, services và adapter. |

Embed liệt kê mọi nhân vật đã đăng ký theo từng phái. Nếu một phái dài hơn giới hạn một ô của Discord, danh sách được nối sang ô tiếp theo. Khi đóng sự kiện, bảng và vote được giữ làm lịch sử, các nút thao tác bị khóa. Một server có thể mở nhiều sự kiện cùng lúc. Mỗi sự kiện cần một tên riêng.

## Yêu cầu và cài đặt trên Windows

1. Cài Node.js 22 LTS trở lên từ [nodejs.org](https://nodejs.org/).
2. Mở thư mục `duydinh-discord-bot` có chứa `package.json` trong VS Code. Trong terminal PowerShell:

   ```powershell
   Set-Location 'C:\studyit\botdiemdanhdiscord\duydinh-discord-bot\duydinh-discord-bot'
   Copy-Item .env.example .env
   ```

3. Tạo Application trong [Discord Developer Portal](https://discord.com/developers/applications). Tại trang **Bot**, tạo bot và sao chép token. Tại **General Information**, sao chép Application ID.
4. Mở `.env`, điền `DISCORD_TOKEN` và `DISCORD_CLIENT_ID`. Không đưa file `.env` hoặc bot token lên Git hay chia sẻ cho người khác. Nếu token bị lộ, hãy reset token trong Developer Portal.
5. Trong terminal tại thư mục dự án, cài dependency, kiểm tra cú pháp và test:

   ```powershell
   npm.cmd install
   npm.cmd run check
   npm.cmd test
   ```

## Mời bot vào nhiều server

Trong Developer Portal, mở **OAuth2 → URL Generator**:

1. Chọn scopes `bot` và `applications.commands`.
2. Chọn quyền tối thiểu **View Channels**, **Send Messages**, **Embed Links**, **Read Message History**. Bot không cần Administrator hoặc quyền quản lý role.
3. Sao chép URL được tạo và mở URL đó để chọn từng server mà bạn có quyền quản lý. URL không gắn với một `GUILD_ID` cố định.

URL mẫu (thay Application ID của bạn):

```text
https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=84992&scope=bot%20applications.commands
```

Các lệnh được triển khai bằng **global application commands**. Global commands dùng được trong các guild mà bot đã được mời, nhưng Discord có thể cần vài phút để phát tán lệnh mới hoặc thay đổi.

## Chạy bot và thiết lập từng server

Đăng ký slash commands global và chạy bot:

```powershell
npm.cmd run deploy-commands
npm.cmd start
```

Trong từng server, người có quyền Manage Server/Administrator:

1. Chạy `/setup`, chọn role thành viên và kênh đăng bảng. Có thể chọn thêm `admin_role`; nếu không chọn, người có quyền Manage Server/Administrator vẫn quản trị được bot.
2. Chạy `/event-create` để mở sự kiện và nhập tên, thời gian, DKP/ghi chú. Trường `time` nhận nội dung hiển thị, ví dụ `2:24 AM 22/10/2026` hoặc `14:24 22/10/2026`; bot giữ nguyên cách viết bạn nhập.
3. Người chơi có role đã cấu hình dùng `/register` hoặc nút **Nhân vật** để tạo hồ sơ một lần. Form hỏi tên, phái, và Cửu Vĩ Thần Cung hoặc Khách Scrim.
4. Trên bảng sự kiện, chọn Có mặt, Đến muộn hoặc Vắng mặt. Nếu chưa có hồ sơ, bot mở form đăng ký rồi ghi luôn trạng thái đó. Nút **Đăng ký tham gia** để tên vào sự kiện với trạng thái **Chưa xác nhận**. Người chưa bấm gì được đếm là **Chưa đăng ký**.
5. Dùng `/event-edit`, `/event-close` hoặc `/event-delete` và nhập đúng tên sự kiện. Đóng giữ lịch sử. Xóa gỡ sự kiện, phiếu và bảng Discord. `/refresh` làm mới mọi bảng đang mở.

Role được kiểm tra lại trong ứng dụng; việc một lệnh hiện trong Discord không thay thế kiểm tra quyền này. Mỗi server tự lưu role và kênh riêng, vì vậy thao tác ở server này không dùng cấu hình của server khác.

## Kiểm tra và xử lý lỗi

- `npm.cmd run check`: kiểm tra cú pháp JavaScript.
- `npm.cmd test`: chạy unit tests; không cần Discord token thật.
- `npm.ps1 cannot be loaded`: chạy `npm.cmd` thay vì `npm`.
- Slash command chưa xuất hiện: kiểm tra Application ID, invite scope `applications.commands`, chạy lại `npm.cmd run deploy-commands` và chờ Discord cập nhật global commands.
- Trường thời gian trên `/event-create` và `/event-edit` có gợi ý định dạng như `2:24 AM 22/10/2026`. Đây là văn bản hiển thị trên bảng, bot không tự đổi múi giờ hoặc phân tích ngày giờ.
- Bot không gửi/sửa Embed: kiểm tra quyền View Channels, Send Messages, Embed Links và Read Message History ở đúng kênh.
- Lỗi parse JSON: dừng bot, backup file dữ liệu và phục hồi JSON hợp lệ; bot báo lỗi thay vì âm thầm xóa/ghi đè dữ liệu lỗi.
- Bảng không tự cập nhật: dùng `/refresh`; kiểm tra bot còn truy cập được kênh đã cấu hình.

Không cần bật Message Content Intent vì bot chỉ xử lý slash commands và interactions.

## Chạy bot trên VPS Linux bằng Docker

VPS cần cài Docker Engine và Docker Compose plugin. Trong thư mục dự án trên VPS, tạo file cấu hình từ mẫu rồi điền token và Application ID:

```bash
cp -n .env.example .env
nano .env
mkdir -p data
```

Nếu đã có dữ liệu từ máy cũ, hãy chép `data/configs.json` và `data/guild-data.json` vào thư mục `data`. Đảm bảo thư mục này cho phép user trong container ghi dữ liệu:

```bash
sudo chown -R 1000:1000 data
```

Đăng ký slash commands một lần, sau đó chạy bot nền:

```bash
docker compose build
docker compose run --rm bot npm run deploy-commands
docker compose up -d
docker compose logs -f
```

Compose tự khởi động lại bot sau khi tiến trình lỗi hoặc VPS reboot. Dữ liệu được giữ trong thư mục `data` bên ngoài container. Một số lệnh quản lý hữu ích:

```bash
docker compose logs -f
docker compose restart
docker compose down
```

Khi cập nhật mã nguồn, chạy `docker compose build` rồi `docker compose up -d`. Chỉ chạy một container bot trên cùng thư mục dữ liệu. Sao lưu định kỳ thư mục `data`; không xóa thư mục này khi cập nhật. Không đưa file `.env` lên Git hoặc chia sẻ token bot.
