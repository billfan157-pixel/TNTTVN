# Liên kết dữ liệu cổng Giáo xứ và Xứ đoàn

## Kết luận và giới hạn

Cổng đã dùng chung một số nguồn dữ liệu quan trọng, nhưng không thể chứng nhận đồng bộ toàn diện chỉ từ việc các trang cùng hiển thị dữ liệu. Đợt kiểm tra này xác định và sửa lỗi vòng đời snapshot Hồ sơ khi phiên đăng nhập thay đổi. Đây là đánh giá source và regression local; không phải xác nhận production, thông báo máy thật hoặc đồng bộ nhiều thiết bị.

## Những liên kết đã đối chiếu trong source

`OrganizationDashboardPage` lấy snapshot từ `parishProfileStore`, lịch từ `parishEventStore`, thông báo từ `noticeStore`, công việc từ `operationsStore`. Effect của trang gọi lại các fetch tương ứng. Dashboard không tạo một cơ sở dữ liệu cơ cấu riêng.[1]

Operations có `upsertPublicCalendarEvent` cập nhật projection `parish_events` theo `parish_id`, và `enqueuePublicEventParentNotification` chọn phụ huynh active trong cùng giáo xứ. Hai helper nhận transaction; đây là liên kết server, không phụ thuộc Calendar tự tạo lại sự kiện. Việc notification row được tạo không chứng minh push đã tới thiết bị.[2]

Parish Profile dùng `requireLinkedUser`, `assertLinkedUserAvailable`, `requirePerson`, `requireUnit`, `requireSourceEvent` khi xử lý các quan hệ tài khoản–người, nhiệm kỳ–đơn vị và hồ sơ–sự kiện. Các guard này là bằng chứng có kiểm tra quan hệ; không thay thế kiểm tra toàn bộ dữ liệu legacy.[3]

Calendar store đã có scope `parishId:userId`, sequence cho request và lọc tenant cho cache. `resetStores` gọi clear các store Hồ sơ/Lịch/Operations.[4]

## Lỗi đã sửa: snapshot quay lại sau reset phiên

Trước sửa, `parishProfileStore.load` luôn ghi response vào store và `clear` chỉ xóa state. Request cũ hoàn thành sau clear có thể đưa hồ sơ, danh sách người và quyền hiển thị của phiên trước trở lại. Mutation cũ cũng có thể kích hoạt refresh sau khi phiên đã đổi. Đây là lỗi cách ly trạng thái client, không phải bằng chứng backend cho phép truy cập chéo giáo xứ.[5]

Store nay chụp tenant/user scope, epoch reset và số thứ tự request; response/error cũ bị bỏ qua. Snapshot sai parish ở profile hoặc các collection có parishId bị từ chối. Mutation đã commit vẫn trả thành công, nhưng không refresh hoặc sửa state của phiên mới. Không thêm hàng đợi offline cho các mutation hồ sơ.[5]

## Phạm vi chưa đủ bằng chứng

Checkpoint vòng đời preview: cleanup cũ theo dependency `selectedFiles` thu hồi
cả URL còn được chọn khi danh sách thay đổi. Modal nay chỉ thu hồi URL bị loại
khỏi danh sách và thu hồi phần còn lại lúc unmount; lọc chọn trùng trước khi tạo
URL, kể cả trùng trong cùng một batch. Suite modal 12/12 đạt, lint và diff check
phần sửa đạt. Đây là kiểm chứng DOM/mock URL local, chưa phải visual QA máy thật.

Checkpoint tiếp theo: upload lỗi ngay tệp đầu cũng refresh để đối soát vì commit
có thể đã xảy ra trước khi mất response. Thông báo ghi số tệp đã xác nhận và yêu
cầu kiểm tra kho trước retry. Source `src/lib/api/core.ts` không tự retry POST
upload không có idempotency key. Hai suites đạt 20 tests; sau bổ sung regression
UI chỉ gửi lại file chưa xác nhận, modal 11/11 đạt (không cộng các lượt trùng).
TypeScript đạt cho delta store; lint phạm vi sửa đạt. Ghi chú test UI bị chặn bên
dưới là lịch sử, đã được đóng bằng lượt chạy này. Chưa thêm server idempotency:
đối soát/UX giảm rủi ro nhưng không bảo đảm exactly-once khi mất phản hồi.

Verification local: 4 suites / 31 tests đạt (Profile store, Calendar store,
OrganizationDashboardPage, Parish Profile backend). Sau đó bổ sung hai regression,
Profile store 7/7 đạt; không cộng hai lượt có test trùng. `tsc -b` đạt sau sửa
fixture thiếu trường bắt buộc; lint phần sửa và diff check đạt. Chưa chạy production
bundle hoặc E2E toàn cổng trong lượt này.

- Chưa chứng minh mọi thay đổi từ một thiết bị tự xuất hiện ngay ở thiết bị khác; fetch khi vào trang không tương đương realtime invalidation.
- Chưa chạy lại toàn bộ offline/reconnect, notification provider, native push hoặc E2E toàn cổng trong đợt này.
- Chưa audit dữ liệu production về reference orphan, account links và nhiệm kỳ thực tế. Không tự sửa cơ cấu hoặc chọn người giữ chức vụ.
- Batch upload assets vẫn là chuỗi request riêng, không phải transaction atomic. Đã bổ sung dừng batch khi reset/đổi phiên, refresh phần đã commit khi tệp sau lỗi, thông báo số tệp thành công và loại tệp đã được xác nhận khỏi danh sách thử lại ở modal. Hai suites store/modal đạt 19 tests; lint phần sửa và diff check đạt. Lượt thêm regression UI chuyên biệt chưa được áp dụng do công cụ từ chối khi hết hạn mức; kết quả TypeScript của delta này chưa thu được sau gián đoạn. Không suy từ các test sẵn có rằng retry đã được chứng minh end-to-end.
- Upload mất response sau commit vẫn là kết quả không chắc chắn: chưa có bằng chứng idempotency theo từng tệp để bảo đảm retry không tạo bản trùng. Đây là rủi ro còn mở, khác với trường hợp đã nhận xác nhận thành công.

## Nguồn repository

1. [OrganizationDashboardPage](../src/pages/OrganizationDashboardPage.tsx): subscriptions và mount effect.
2. [Operations routes](../server/src/routes/operations.ts): publicCalendarProjection, upsertPublicCalendarEvent, enqueuePublicEventParentNotification.
3. [Parish Profile service](../server/src/services/parishProfileService.ts): relation validators và mutation transactions.
4. [Calendar store](../src/stores/parishEventStore.ts), [resetStores](../src/stores/resetStores.ts).
5. [Profile store](../src/stores/parishProfileStore.ts), [regression](../src/__tests__/stores/parishProfileStore.test.ts).
