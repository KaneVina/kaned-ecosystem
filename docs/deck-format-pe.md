# Viết phần PE (thi thực hành) trong bộ đề Kaned

Tài liệu này dành cho người và cho AI soạn file bộ đề. Đưa nguyên file này cho AI kèm đề PE gốc, AI sẽ viết ra phần PE đúng định dạng để dán vào cuối file bộ đề `.md` của môn.

Phần PE nằm **trong cùng file** với phần trắc nghiệm FE, như một chương riêng tên **PE**. Người học thấy nó trong Thẻ ghi nhớ như một chương, nhưng nhãn hiện là **PE** thay vì "Chương n".

---

## 1. Bức tranh tổng thể

```
---
môn: PRM393
tên: Ôn thi PRM393
mô tả: …
---

# Chương 1: …          ← phần FE như cũ
## Mẹo 1: …
## Câu 1
…

# PE: Thi thực hành     ← từ đây là phần PE (một chương)

## Mẹo 60: …           ← mẹo dùng cho câu PE (không bắt buộc)

## Đề 1: Ứng dụng quản lý sách       ← một đề bài
[SU26_B10][FA25_B5]
Nội dung đề…

## Câu 301                         ← các câu hỏi về Đề 1
…
## Câu 302
…

## Đề 2: Đọc và lọc dữ liệu JSON      ← đề tiếp theo
…
## Câu 310
…
```

Ba khối dùng trong phần PE:

| Khối | Bắt đầu bằng | Là gì |
|---|---|---|
| Chương PE | `# PE` hoặc `# PE: tên` | Mở phần thi thực hành. Mọi đề, câu, mẹo bên dưới thuộc PE cho tới dòng `#` tiếp theo. |
| Đề | `## Đề 1: tên đề` | Một đề bài (problem statement). Mọi `## Câu` phía dưới thuộc đề này cho tới `## Đề` tiếp theo hoặc `#` tiếp theo. |
| Câu | `## Câu 301` | Một câu hỏi về đề đang mở: câu tự luận (viết code, có lời giải mẫu) hoặc câu trắc nghiệm. |

Khi người học làm câu 302, Kaned **luôn hiện đề 1 ở phía trên câu hỏi**, kèm danh sách các câu cùng đề (301, 302, 303…) để chuyển qua lại và nút "Luyện cả đề".

---

## 2. Chương PE

~~~
# PE: Thi thực hành
~~~

- Viết đúng chữ `PE` ở đầu tiêu đề `#`. Các cách sau đều được: `# PE`, `# PE: Thi thực hành`, `# PE – Lập trình Flutter`.
- Đặt chương PE **sau** các chương FE (cuối file).
- Không đánh số chương cho PE (không viết `# Chương 14: PE`); Kaned tự xếp nó sau chương cuối.
- Nếu môn có nhiều dạng PE rất khác nhau, có thể có nhiều chương `# PE: …`, nhưng thường một chương là đủ.

---

## 3. Đề

~~~
## Đề 1: Ứng dụng quản lý sách
[SU26_B10][FA25_B5]
Viết ứng dụng Flutter quản lý danh sách sách gồm 2 màn hình.

**Màn hình 1 – Danh sách**
- Hiển thị danh sách sách từ file `assets/books.json`.
- Mỗi dòng gồm tên sách, tác giả, giá.

**Màn hình 2 – Chi tiết**
- Bấm vào một sách thì mở màn hình chi tiết.

Dữ liệu mẫu:
```json
[
  { "id": 1, "title": "Dart cơ bản", "author": "An", "price": 120000 }
]
```

Thời gian làm bài: 85 phút.
~~~

Quy tắc:

1. **Dòng tiêu đề:** `## Đề <số>: <tên ngắn của đề>`. Số đề là số nguyên, không trùng trong file (Đề 1, Đề 2, …). Tên đề bắt buộc có.
2. **Mã kỳ thi (không bắt buộc, nên có):** dòng đầu tiên của nội dung đề là các mã kỳ thi trong ngoặc vuông, viết liền: `[SU26_B10][FA25_B5]`. Ý nghĩa và cách viết giống hệt phần FE (mục 7). Mọi câu thuộc đề **tự động mang** các mã này, nên không cần lặp lại ở từng câu.
3. **Nội dung đề:** viết tự do bằng Markdown đơn giản:
   - Đoạn văn cách nhau một dòng trống.
   - Dòng bắt đầu bằng `- ` là gạch đầu dòng.
   - `**chữ đậm**` cho ý quan trọng, `` `code` `` cho tên biến, tên file, tên hàm.
   - Code, dữ liệu mẫu, cấu trúc thư mục, kết quả mong đợi: đặt giữa hai dòng ```` ``` ````, có thể ghi ngôn ngữ (```` ```dart ````, ```` ```sql ````, ```` ```json ````, ```` ```java ````, ```` ```text ````). Thụt lề được giữ nguyên. Bên trong khối code, dòng bắt đầu bằng `#` (comment Python, bash…) vẫn là code, không bị hiểu là tiêu đề.
4. **Chép đề đầy đủ:** người học chỉ thấy đề ở đây, nên giữ đủ yêu cầu, ràng buộc, dữ liệu mẫu, input/output mẫu, thang điểm nếu có.
5. **Không** đặt câu hỏi, đáp án hay lời giải trong phần đề.

---

## 4. Câu hỏi trong đề

Một đề có **một hoặc nhiều câu**. Thường mỗi yêu cầu của đề là một câu (Câu 301 = yêu cầu 1, Câu 302 = yêu cầu 2…). Đề chỉ có một yêu cầu thì chỉ cần một câu.

Câu thuộc đề nào: là đề `## Đề` **gần nhất phía trên** nó. Muốn ghi rõ (hoặc đặt câu ở chỗ khác), thêm dòng `Đề: 1` trong câu.

Có hai loại câu.

### 4a. Câu tự luận (viết code) – loại chính của PE

Không có phương án `- [ ]`. Thay vào đó có **`Lời giải:`** là lời giải mẫu.

~~~
## Câu 301
Yêu cầu 1 (2 điểm): Đọc file `assets/books.json` và hiển thị danh sách sách bằng `ListView.builder`.
> Gợi ý: Khai báo asset trong pubspec.yaml, đọc bằng rootBundle.loadString rồi jsonDecode.
Lời giải:
```dart
Future<List<Book>> loadBooks() async {
  final raw = await rootBundle.loadString('assets/books.json');
  final list = jsonDecode(raw) as List;
  return list.map((e) => Book.fromJson(e)).toList();
}
```
Hiển thị bằng `FutureBuilder` và `ListView.builder`, mỗi item là một `ListTile`.
> Giải thích: Đọc asset là bất đồng bộ nên phải dùng Future; ListView.builder chỉ dựng các dòng đang hiện nên nhẹ với danh sách dài.
> Ghi chú: Nhớ khai báo `assets/books.json` trong `pubspec.yaml`, quên là mất điểm cả câu.
Mẹo: 60
Dễ nhầm: 305
~~~

Quy tắc của `Lời giải:`:

- Viết `Lời giải:` trên **một dòng riêng**, rồi nội dung lời giải ở các dòng bên dưới. Lời giải ngắn có thể viết luôn sau dấu hai chấm: `Lời giải: dùng jsonDecode rồi map sang Book.fromJson`.
- Lời giải gồm code trong khối ```` ``` ```` và/hoặc lời văn (các bước làm, câu lệnh SQL, lệnh terminal…). Có thể có nhiều khối code và lời văn xen kẽ.
- Lời giải **kết thúc** ở dòng đầu tiên (nằm ngoài khối code) bắt đầu bằng `>`, `Mẹo:`, `Dễ nhầm:` hoặc `Đề:`, hoặc ở tiêu đề `##`/`#` tiếp theo. Vì vậy đặt các dòng `>`, `Mẹo:`, `Dễ nhầm:` **sau** lời giải.
- Mọi khối ```` ``` ```` phải được đóng.
- Lời giải nên **đủ để chấm**: code chạy được cho đúng phần yêu cầu đó (không cần cả project), kèm 1–3 câu nói ý chính. Nếu đề gốc không có lời giải, hãy viết lời giải chuẩn, đúng phiên bản công nghệ của môn.

Người học sẽ: đọc đề và yêu cầu → (tuỳ chọn) gõ bài làm vào ô nháp → bấm **Xem lời giải** → tự chấm **Làm đúng / Gần đúng / Chưa làm được**. Kaned dùng mức tự chấm này để xếp lịch ôn lại như câu trắc nghiệm.

### 4b. Câu trắc nghiệm về đề

Dùng khi muốn hỏi nhanh một ý của đề (chọn widget, chọn câu lệnh, đoán kết quả code). Viết y hệt câu FE: có các dòng `- [ ]` / `- [x]`. Câu này vẫn hiện kèm đề.

```
## Câu 302
Ở màn hình 1, khi người dùng bấm vào một sách, cách mở màn hình chi tiết đúng là gì?
- [ ] setState(() => page = 2)
- [x] Navigator.push(context, MaterialPageRoute(builder: (_) => DetailPage(book: book)))
- [ ] runApp(DetailPage(book: book))
- [ ] Navigator.pop(context, book)
> Giải thích: Navigator.push đưa route mới lên stack; pop dùng để quay lại.
Mẹo: 61
```

Câu trắc nghiệm có thể có thêm `Lời giải:` nếu muốn hiện code tham khảo, nhưng không bắt buộc.

> Câu tự luận **không** vào "Thi thử" trắc nghiệm và không vào phòng thi FE; chúng chỉ dùng trong Luyện tập, Thẻ ghi nhớ và Tra cứu. Câu trắc nghiệm thuộc đề vẫn vào Thi thử (kèm đề), nhưng không vào phòng thi FE.

### 4c. Các dòng dùng được trong câu PE

| Dòng | Ý nghĩa | Khi nào hiện |
|---|---|---|
| Dòng ngay sau `## Câu …` | Nội dung yêu cầu (có thể nhiều dòng, có code ```` ``` ````). | Luôn hiện |
| `Lời giải:` + nội dung | Lời giải mẫu. Bắt buộc với câu tự luận. | Sau khi bấm "Xem lời giải" |
| `> Gợi ý:` | Một gợi ý hướng làm, không lộ đáp án. | Khi người học bấm "Gợi ý" |
| `> Giải thích:` | Vì sao làm như vậy, lỗi hay gặp. | Sau khi chấm |
| `> Ghi chú:` | Lưu ý thêm (bẫy mất điểm, phiên bản thư viện…). | Sau khi chấm |
| `> Lưu ý đáp án:` | Đáp án khác giáo trình hoặc khác đề gốc. | Luôn hiện |
| `Mẹo: 60, 61` | Số các mẹo dùng cho câu này. | Sau khi chấm |
| `Dễ nhầm: 305` | Số các câu dễ nhầm với câu này (cùng hoặc khác đề). | Sau khi chấm |
| `Đề: 1` | Gắn câu vào đề 1 (khi không đặt ngay dưới `## Đề 1`). | – |

Dòng `>` dài có thể viết tiếp ở dòng `>` ngay dưới, không có nhãn.

---

## 5. Đánh số

- **Số câu PE phải khác mọi số câu FE** trong file. Cách an toàn: bắt đầu PE từ một số tròn lớn hơn câu FE cuối cùng, mỗi đề một "khoảng" riêng:
  - FE có 485 câu → Đề 1 dùng Câu 501–509, Đề 2 dùng Câu 511–519, Đề 3 dùng 521–529…
- Có thể dùng số kiểu `501.1` cho **kiểu hỏi khác** của câu 501 (giống FE).
- **Số mẹo** cũng không trùng mẹo FE: FE có 52 mẹo → mẹo PE bắt đầu từ 60.
- **Số đề** bắt đầu từ 1 và tăng dần.

---

## 6. Mẹo cho PE

Giống mẹo FE, đặt trong chương PE (thường ngay dưới `# PE`, trước các đề):

```
## Mẹo 60: Đọc file asset trong Flutter
Ba bước: **khai báo** trong `pubspec.yaml` → **rootBundle.loadString** → **jsonDecode**.

Quên bước khai báo là lỗi mất điểm phổ biến nhất của đề đọc file.
```

Câu dùng mẹo ghi `Mẹo: 60`. Mẹo nên là quy tắc ngắn, dễ nhớ, dùng lại được cho nhiều đề.

---

## 7. Mã kỳ thi

Mã kỳ thi cho biết đề đã ra ở kỳ nào; người học lọc được "Chỉ SU26_B10", "Hay ra trước".

- Dạng: `[<mùa><năm>_B<số tuần>]`, mùa là `SP` (Spring), `SU` (Summer), `FA` (Fall), năm 2 chữ số. Ví dụ `[SU26_B10]`, `[FA25_B5]`.
- Thi lại thêm `_RE`: `[SU26_B10_RE]`.
- Nhiều kỳ: viết liền nhiều ngoặc `[SU26_B10][FA25_B5]` hoặc một ngoặc có dấu phẩy `[SU26_B10, FA25_B5]`.
- **Đặt ở dòng đầu nội dung đề** (mục 3). Câu thuộc đề tự mang mã của đề. Chỉ ghi mã ở đầu câu (`[SU26_B10] Khi bấm nút…`) khi riêng câu đó ra thêm ở kỳ khác.
- Không biết kỳ nào thì bỏ trống, đừng đoán.

---

## 8. Kiểm tra trước khi nộp file

Kaned báo lỗi kèm số dòng khi nhập file. Các lỗi hay gặp:

| Thông báo | Sửa |
|---|---|
| Câu X chưa có phương án … Câu tự luận (PE) thì viết "Lời giải:" | Câu tự luận thiếu `Lời giải:`. |
| Câu X cần ít nhất 2 phương án | Câu chỉ có một dòng `- [ ]`: thêm phương án, hoặc bỏ hết và viết `Lời giải:`. |
| Lời giải câu X mở khối code bằng ``` nhưng chưa đóng | Thêm dòng ```` ``` ```` đóng khối. |
| Câu X thuộc Đề N, nhưng file không có đề này | Sai số ở dòng `Đề:`, hoặc thiếu `## Đề N`. |
| Đề N chưa có nội dung đề bài | Thêm nội dung dưới `## Đề N: …`. |
| Đề N chưa có câu hỏi nào bên dưới (cảnh báo) | Thêm ít nhất một `## Câu`. |
| Câu X bị trùng số | Đổi số câu PE sang khoảng chưa dùng (mục 5). |

Danh sách tự kiểm:

- [ ] Có dòng `# PE` (hoặc `# PE: …`) trước đề đầu tiên.
- [ ] Mỗi đề có `## Đề n: tên`, mã kỳ thi ở dòng đầu (nếu biết) và nội dung đầy đủ.
- [ ] Mỗi câu tự luận có `Lời giải:` và các dòng `>`/`Mẹo:`/`Dễ nhầm:` nằm **sau** lời giải.
- [ ] Mọi khối ```` ``` ```` đều đóng.
- [ ] Số câu, số mẹo không trùng với phần FE.
- [ ] Không có chữ nào nằm ngoài `## Câu`, `## Mẹo`, `## Đề`.

---

## 9. Mẫu hoàn chỉnh

~~~
# PE: Thi thực hành

## Mẹo 60: Đọc file asset trong Flutter
Ba bước: **khai báo** trong `pubspec.yaml` → **rootBundle.loadString** → **jsonDecode**.

## Mẹo 61: Chuyển màn hình
Mở màn hình mới: **Navigator.push**. Quay lại và trả kết quả: **Navigator.pop(context, value)**.

## Đề 1: Ứng dụng quản lý sách
[SU26_B10][FA25_B5]
Viết ứng dụng Flutter quản lý sách gồm 2 màn hình.

**Màn hình 1 – Danh sách**
- Đọc danh sách sách từ `assets/books.json` và hiển thị tên, tác giả, giá.

**Màn hình 2 – Chi tiết**
- Bấm một sách thì mở màn hình chi tiết; nút "Mua" quay lại và hiện SnackBar "Đã thêm vào giỏ".

```json
[
  { "id": 1, "title": "Dart cơ bản", "author": "An", "price": 120000 }
]
```

## Câu 501
Yêu cầu 1 (3 điểm): Đọc `assets/books.json` và hiển thị danh sách bằng `ListView.builder`.
> Gợi ý: Đọc asset là bất đồng bộ.
Lời giải:
```dart
Future<List<Book>> loadBooks() async {
  final raw = await rootBundle.loadString('assets/books.json');
  return (jsonDecode(raw) as List).map((e) => Book.fromJson(e)).toList();
}
```
Dùng `FutureBuilder<List<Book>>`, khi có dữ liệu thì trả về `ListView.builder` với mỗi dòng là `ListTile(title: Text(b.title), subtitle: Text(b.author))`.
> Giải thích: FutureBuilder tự dựng lại khi Future xong; ListView.builder chỉ dựng dòng đang hiện.
> Ghi chú: Thiếu khai báo asset trong pubspec.yaml thì app báo lỗi "Unable to load asset".
Mẹo: 60

## Câu 502
Yêu cầu 2 (3 điểm): Bấm vào một sách thì mở màn hình chi tiết; nút "Mua" quay lại màn hình 1 và hiện SnackBar "Đã thêm vào giỏ".
Lời giải:
```dart
// Màn hình 1
onTap: () async {
  final bought = await Navigator.push<bool>(
    context,
    MaterialPageRoute(builder: (_) => DetailPage(book: b)),
  );
  if (bought == true && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Đã thêm vào giỏ')),
    );
  }
},

// Màn hình 2
ElevatedButton(
  onPressed: () => Navigator.pop(context, true),
  child: const Text('Mua'),
)
```
> Giải thích: push trả về Future nhận giá trị mà pop gửi lại.
Mẹo: 61
Dễ nhầm: 503

## Câu 503
Để màn hình 1 biết người dùng đã bấm "Mua" ở màn hình 2, cách đúng là gì?
- [ ] Gọi setState của màn hình 1 từ màn hình 2
- [x] await Navigator.push(...) và đọc giá trị trả về từ Navigator.pop(context, true)
- [ ] Dùng runApp để tải lại màn hình 1
- [ ] Gọi Navigator.pushReplacement ở màn hình 2
Mẹo: 61

## Đề 2: Đếm số
[SP26_B10]
Viết ứng dụng có một `Text` hiển thị số đếm và một nút **+** tăng số đếm thêm 1.

## Câu 511
Viết toàn bộ `CounterPage` đáp ứng đề.
Lời giải:
```dart
class CounterPage extends StatefulWidget {
  const CounterPage({super.key});
  @override
  State<CounterPage> createState() => _CounterPageState();
}

class _CounterPageState extends State<CounterPage> {
  int count = 0;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(child: Text('$count')),
        floatingActionButton: FloatingActionButton(
          onPressed: () => setState(() => count++),
          child: const Icon(Icons.add),
        ),
      );
}
```
> Giải thích: Đổi dữ liệu trong setState thì build chạy lại và Text hiện số mới.
~~~

---

## 10. Lời nhắn cho AI soạn file

Khi được giao soạn phần PE từ đề gốc:

1. Đọc toàn bộ file bộ đề hiện có để biết **số câu và số mẹo lớn nhất** đang dùng; đánh số PE theo mục 5.
2. Mỗi đề gốc thành một `## Đề n`, chép nguyên đề (dịch sang tiếng Việt nếu đề gốc tiếng Anh và môn đang dùng tiếng Việt; giữ nguyên tên biến, tên hàm, dữ liệu mẫu).
3. Tách đề thành các câu theo từng yêu cầu chấm điểm. Mỗi câu có: nội dung yêu cầu, `> Gợi ý:`, `Lời giải:` chạy được, `> Giải thích:`, và `> Ghi chú:` về lỗi mất điểm thường gặp nếu có.
4. Thêm 1–2 câu trắc nghiệm cho các ý dễ nhầm của đề nếu hữu ích.
5. Gom các quy tắc dùng lại được thành `## Mẹo` và gắn `Mẹo:` vào câu.
6. Chỉ xuất **phần từ `# PE` trở xuống**, trong một khối Markdown, để người dùng dán vào cuối file bộ đề. Không viết lại phần FE.
7. Tự kiểm lại theo danh sách ở mục 8 trước khi trả kết quả.
