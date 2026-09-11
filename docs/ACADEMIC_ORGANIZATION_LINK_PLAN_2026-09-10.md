# Liên kết Ngành, lớp và Chi đoàn

## Yêu cầu đã duyệt

Ngành/Ban trực thuộc Ban Điều hành. Chi đoàn liên kết lớp và trực thuộc Ngành của lớp. Trưởng Chi đoàn lấy từ GLV chủ nhiệm. Sơ đồ lọc theo năm học đang chọn, giữ dữ liệu các năm trước để xem lịch sử. Không dùng users.role để suy ra chủ nhiệm lớp.

## Nguồn dữ liệu đã kiểm tra

- `server/src/db/schema.ts`: `branches` đã có ID theo giáo xứ; `classes` có branchId, academicYearId và deletedAt; `catechist_assignments` có roleInClass và unique chủ nhiệm mỗi lớp.
- `src/stores/academicYearStore.ts`: currentYear là năm học được chọn. Hai trang Hồ sơ/Dashboard hiện chưa dùng giá trị này để lọc cơ cấu.
- `server/src/services/parishProfileService.ts`: snapshot đọc đơn vị và nhiệm kỳ riêng; chưa có liên kết tới lớp.

## Thứ tự triển khai và gate

1. Ràng buộc managed writer: CHAPTER thuộc active BRANCH; không vô hiệu hóa/đổi loại Ngành còn Chi đoàn. Form chỉ đưa Ngành vào lựa chọn cha của Chi đoàn. Đã triển khai bước này; không tự chọn ngẫu nhiên nếu có nhiều Ngành.
2. Thêm liên kết bền vững đơn vị–branch/class bằng ID cùng parish và uniqueness, không ghép tự động theo tên. Reconciliation phải phát hiện đơn vị legacy cần ghép, không tạo bản trùng hoặc tự di chuyển cây hiện có. Migration additive và regression tenant/idempotency là gate.
3. Provision Ngành từ catalog hiện có (Chiên Con, Ấu Nhi, Thiếu Nhi, Nghĩa Sĩ, Hiệp Sĩ), tạo Chi đoàn theo lớp qua command có audit. Không ghi ngầm trong GET snapshot. Đồng bộ đổi tên/chuyển ngành/xóa lớp bằng đường writer của lớp; không sao chép chủ nhiệm thành nhiệm kỳ thủ công.
4. Snapshot trả quan hệ lớp và GLV chủ nhiệm tối thiểu, có lọc năm học. Lọc/switch năm ở Hồ sơ và Dashboard; request cũ không được ghi đè năm mới. Các mục liên kết chỉ chỉnh ở màn hình nguồn.
5. Kiểm tra dữ liệu chủ nhiệm của năm cũ: assignment hiện tại không tự chứng minh lịch sử bất biến sau khi đã sửa. Không bịa lịch sử; dùng snapshot đã có hoặc chỉ rõ giới hạn trước khi phát triển lưu vết mới.
6. E2E lớp → Chi đoàn → đổi chủ nhiệm → đổi năm → xác minh tenant và quyền. Không tự cấp capability Operations mới cho Trưởng Chi đoàn khi chưa có rule riêng.

## Trạng thái

Đã có command `POST /parish-profile/organization/refresh` đồng bộ mặc định từ
catalog Ngành và lớp cùng parish. Client gọi command khi tải snapshot; GET vẫn
chỉ đọc. Dùng ID xác định từ source ID, không thêm bảng hoặc tạo nhiệm kỳ thay
cho chủ nhiệm. Hồ sơ/Dashboard lọc Chi đoàn theo `currentYear`; form tạo mới chỉ
còn COMMITTEE/OTHER và route create kiểm tra cùng giới hạn.

Trưởng Chi đoàn đọc từ `catechist_assignments.role_in_class=chunhiem` của đúng
lớp, join account cùng parish, active, chưa xóa và thuộc staff. Account role
`chunhiem` không tự chọn một người làm trưởng. Đổi phân công được phản ánh khi
snapshot tải lại; chưa có subscription realtime. Chưa có chủ nhiệm hợp lệ thì
hiển thị chưa phân công, không tự bổ nhiệm người khác.

Giới hạn cần tiếp tục xử lý: các Ngành/Chi đoàn legacy nhập tay không được ghép
theo tên hoặc tự xóa; có thể tồn tại song song với đơn vị mặc định và cần mapping
có duyệt. Command hiện đồng bộ khi tải cổng, chưa được gọi từ mọi writer lớp.
Chủ nhiệm năm cũ lấy phân công còn lưu cho lớp đó, không phải lịch sử bất biến
nếu assignment năm cũ bị sửa. Chưa có E2E cross-layer hoặc deployment thật.

Verification: 5 suites / 45 tests đạt, gồm academic organization, Parish Profile
backend, unit modal, Profile page và Dashboard. Có regression đổi chủ nhiệm,
account role không tự bổ nhiệm, account đã xóa không hiện tên, đồng bộ lặp không
tạo trùng và parish khác không có Chi đoàn của nguồn. Server build và lint phần
sửa đạt. Fixture thiếu ip/userAgent đã được bổ sung sau lượt TypeScript đầu.
