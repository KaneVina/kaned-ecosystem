# Định dạng bộ đề Kaned (.md)

Mỗi bộ đề ôn tập trong mục **Thẻ ghi nhớ** là một file văn bản Markdown. Viết bằng Notepad, VS Code hay bất kỳ trình soạn thảo nào; đẩy lên GitHub vẫn đọc được bình thường. Nhập vào Kaned ở **Quản trị → Bộ đề ôn tập → Nhập bộ đề**; Kaned kiểm tra file và báo lỗi kèm số dòng trước khi lưu.

## Phần đầu file

```
---
môn: MLN122
tên: Ôn thi cuối kỳ MLN122
mô tả: 526 câu trắc nghiệm, có mẹo nhớ.
---
```

`môn` là mã môn: Kaned tự chọn đúng môn khi mã đó chỉ có ở một trường.

## Chương

`# Chương 3: Giá trị thặng dư` mở một chương. Mọi câu và mẹo phía dưới thuộc chương đó cho tới tiêu đề `#` tiếp theo. File không có chương cũng được.

## Câu hỏi

```
## Câu 12
Đâu KHÔNG phải là chức năng của KTCT Mác – Lênin?
- [ ] Nhận thức
- [ ] Tư tưởng
- [x] Giáo dục
> Ghi chú: 4 chức năng: nhận thức, thực tiễn, tư tưởng, phương pháp luận.
> Đề khác: Chức năng khoa học
> Hỏi cách khác: Ai ví thị trường là "bàn tay vô hình"? → Adam Smith
> Lưu ý đáp án: Bộ đề chọn khác giáo trình vì …
Mẹo: 5
Dễ nhầm: 8, 9
```

| Dòng | Ý nghĩa |
|---|---|
| `## Câu 12` | Mở câu 12. Bỏ số thì Kaned tự đánh số tiếp theo. |
| `## Câu 12.1` | Kiểu hỏi khác của câu 12. |
| `- [ ]` / `- [x]` | Phương án sai / đúng. Nhiều `[x]` là câu nhiều đáp án. Tối đa 8 phương án. |
| `> Ghi chú:` | Giải thích, hiện sau khi trả lời. |
| `> Đề khác:` | Có đề dùng đáp án khác. |
| `> Hỏi cách khác: câu hỏi → đáp án` | Cùng ý, hỏi theo cách khác. |
| `> Lưu ý đáp án:` | Đáp án của đề khác giáo trình. Luôn hiện cho người học. |
| `Mẹo: 4, 7` | Các mẹo dùng cho câu này. |
| `Dễ nhầm: 8, 9` | Các câu gần giống nhưng khác đáp án. |

Câu có phương án kiểu "Tất cả các phương án trên", "Cả A và B" được giữ nguyên thứ tự khi người học bật xáo đáp án.

## Mẹo nhớ

```
## Mẹo 5: 4 chức năng của KTCT Mác – Lênin
**Nhận thức – Thực tiễn – Tư tưởng – Phương pháp luận**. Không có chức năng "giáo dục".

Vận dụng quy luật để điều chỉnh chính sách → chức năng **thực tiễn**.
```

Đoạn cách nhau bằng một dòng trống, `**chữ đậm**` cho từ khoá, dòng bắt đầu bằng `- ` thành danh sách.

## Chuyển từ file HTML ôn thi cũ

`python3 scripts/html2deck.py "file-on-thi.html" decks/MON.kaned.md` đọc `window.__DATA__` của file HTML ôn thi kiểu MLN122 và viết ra file bộ đề.
