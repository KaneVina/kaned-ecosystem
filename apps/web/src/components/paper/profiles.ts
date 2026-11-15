/**
 * Content used to draw document pages when a file has no real preview yet.
 *
 * The thirteen discipline profiles are the prototype's own, taken verbatim so
 * the generated pages read exactly like the approved design; "theory" covers
 * political, language and soft-skill courses. A real subject is drawn with the
 * profile of its discipline, under its own code and Vietnamese name.
 */

export type FigureKind =
  | 'tree' | 'table' | 'flow' | 'browser' | 'uml' | 'layers'
  | 'truth' | 'gantt' | 'graph' | 'curve';

export type TabTone = 'violet' | 'teal' | 'amber' | 'rose' | 'blue' | 'green' | 'slate' | 'orange' | 'plum';

export interface PaperProfile {
  id: string;
  code: string;
  tab: TabTone;
  fig: FigureKind | null;
  about: string;
  topics: string[];
  points: string[];
  para: string[];
  questions: string[];
  snippet?: { lang: string; lines: string[] };
  table?: { head: string[]; rows: string[][] };
}

export const TAB_COLORS: Record<TabTone, { c: string; t: string }> = {
  violet: { c: '#5B45C9', t: '#F0EDFC' },
  teal: { c: '#13857A', t: '#E5F4F2' },
  amber: { c: '#C7821C', t: '#FBF2E2' },
  rose: { c: '#C8455F', t: '#FBEAEE' },
  blue: { c: '#2F68C8', t: '#E8F0FB' },
  green: { c: '#2F8645', t: '#E8F4EB' },
  slate: { c: '#4F6075', t: '#ECEFF3' },
  orange: { c: '#CB5D25', t: '#FCEDE4' },
  plum: { c: '#8E3F8B', t: '#F5E9F4' },
};

export const PROFILES: Record<string, PaperProfile> = {
  "dsa": {
    "id": "dsa",
    "code": "CSD201",
    "tab": "violet",
    "fig": "tree",
    "about": "Core course on how data is organised in memory and how to reason about algorithm cost. Expect linked lists, trees, hashing, graphs and sorting, with Big-O analysis throughout.",
    "topics": [
      "Độ phức tạp thuật toán và ký hiệu Big-O",
      "Mảng và danh sách liên kết",
      "Ngăn xếp và hàng đợi",
      "Đệ quy và quay lui",
      "Cây nhị phân tìm kiếm (BST)",
      "Cây AVL và các phép xoay",
      "Bảng băm và xử lý đụng độ",
      "Đồ thị: BFS, DFS và Dijkstra",
      "Các thuật toán sắp xếp"
    ],
    "points": [
      "Cây AVL giữ hệ số cân bằng của mọi nút trong khoảng [-1, 1].",
      "Phép xoay đơn xử lý trường hợp lệch LL và RR, xoay kép xử lý LR và RL.",
      "Thao tác tìm kiếm, chèn và xóa trên cây AVL đều có độ phức tạp O(log n).",
      "Duyệt cây theo thứ tự giữa (in-order) cho dãy khóa tăng dần.",
      "Bảng băm có thời gian truy cập trung bình O(1) nếu hệ số tải thấp.",
      "Dijkstra không áp dụng được khi đồ thị có cạnh trọng số âm."
    ],
    "para": [
      "Cây nhị phân tìm kiếm (Binary Search Tree – BST) là cây nhị phân trong đó mỗi nút có khóa lớn hơn mọi khóa ở cây con trái và nhỏ hơn mọi khóa ở cây con phải. Nhờ tính chất này, thao tác tìm kiếm có thể loại bỏ một nửa không gian ở mỗi bước nếu cây cân bằng.",
      "Tuy nhiên, khi chèn các khóa theo thứ tự tăng dần, BST suy biến thành danh sách liên kết và độ phức tạp tăng lên O(n). Cây AVL khắc phục nhược điểm này bằng cách kiểm tra hệ số cân bằng sau mỗi lần chèn hoặc xóa và thực hiện phép xoay khi cần."
    ],
    "questions": [
      "Cho dãy khóa: 50, 30, 70, 20, 40, 60, 80, 35. Vẽ cây BST thu được sau khi chèn lần lượt các khóa trên. Cho biết kết quả duyệt cây theo thứ tự trước (pre-order).",
      "Chèn lần lượt các khóa 10, 20, 30, 25, 28 vào một cây AVL rỗng. Vẽ cây sau mỗi bước và chỉ rõ phép xoay được sử dụng.",
      "Trình bày thuật toán Dijkstra. Áp dụng tìm đường đi ngắn nhất từ đỉnh A đến các đỉnh còn lại của đồ thị trong Hình 1.",
      "So sánh Quick Sort và Merge Sort về độ phức tạp thời gian trong trường hợp xấu nhất, bộ nhớ phụ và tính ổn định."
    ],
    "snippet": {
      "lang": "Java",
      "lines": [
        "Node rotateRight(Node y) {",
        "    Node x = y.left;",
        "    Node t2 = x.right;",
        "    x.right = y;",
        "    y.left = t2;",
        "    y.height = 1 + max(h(y.left), h(y.right));",
        "    x.height = 1 + max(h(x.left), h(x.right));",
        "    return x;",
        "}"
      ]
    },
    "icon": "binary"
  },
  "db": {
    "id": "db",
    "code": "DBI202",
    "tab": "teal",
    "fig": "table",
    "about": "Designing relational databases from requirements to a working schema: ER modelling, normalisation, SQL querying, indexing and transactions.",
    "topics": [
      "Mô hình thực thể – liên kết (ERD)",
      "Mô hình quan hệ và đại số quan hệ",
      "Ngôn ngữ SQL: truy vấn cơ bản",
      "JOIN, GROUP BY và truy vấn lồng",
      "Phụ thuộc hàm và chuẩn hóa",
      "Chỉ mục và tối ưu truy vấn",
      "Giao tác và điều khiển đồng thời",
      "Stored procedure, trigger và view"
    ],
    "points": [
      "Một lược đồ ở dạng BCNF khi mọi phụ thuộc hàm X → Y đều có X là siêu khóa.",
      "INNER JOIN chỉ trả về các dòng thỏa điều kiện ở cả hai bảng.",
      "GROUP BY đi kèm HAVING để lọc trên kết quả của hàm gộp.",
      "Chỉ mục B-Tree tăng tốc truy vấn phạm vi nhưng làm chậm thao tác ghi.",
      "Tính chất ACID đảm bảo giao tác an toàn khi có lỗi hoặc truy cập đồng thời.",
      "Khóa ngoại đảm bảo ràng buộc toàn vẹn tham chiếu giữa các bảng."
    ],
    "para": [
      "Chuẩn hóa là quá trình phân rã một lược đồ quan hệ thành các lược đồ nhỏ hơn nhằm loại bỏ dư thừa dữ liệu và các dị thường khi thêm, sửa, xóa. Cơ sở của chuẩn hóa là khái niệm phụ thuộc hàm giữa các thuộc tính.",
      "Trong thực tế, phần lớn các hệ thống nghiệp vụ được thiết kế ở dạng chuẩn 3 (3NF). Một số bảng phục vụ báo cáo có thể được phi chuẩn hóa có chủ đích để giảm số phép JOIN và tăng tốc độ truy vấn."
    ],
    "questions": [
      "Cho lược đồ R(A, B, C, D, E) với tập phụ thuộc hàm F = {A → B, BC → D, D → E, E → A}. Tìm tất cả các khóa của R và xác định dạng chuẩn cao nhất.",
      "Viết câu lệnh SQL liệt kê các sinh viên có điểm trung bình lớn hơn điểm trung bình của lớp mà sinh viên đó đang theo học.",
      "Vẽ sơ đồ ERD cho hệ thống quản lý thư viện gồm: Sách, Độc giả, Phiếu mượn, Tác giả. Chuyển sơ đồ sang mô hình quan hệ.",
      "Giải thích hiện tượng “lost update” trong giao tác đồng thời và cách khóa hai pha (2PL) ngăn chặn hiện tượng này."
    ],
    "snippet": {
      "lang": "SQL",
      "lines": [
        "SELECT s.StudentID, s.FullName,",
        "       AVG(e.Score) AS AvgScore",
        "FROM Students s",
        "JOIN Enrollments e ON e.StudentID = s.StudentID",
        "WHERE e.Semester = 'FA25'",
        "GROUP BY s.StudentID, s.FullName",
        "HAVING AVG(e.Score) >= 8.0",
        "ORDER BY AvgScore DESC;"
      ]
    },
    "icon": "database"
  },
  "swe": {
    "id": "swe",
    "code": "SWE201",
    "tab": "blue",
    "fig": "flow",
    "about": "How software gets built by teams: process models, requirements, design, version control and project estimation, with a strong focus on Agile practice.",
    "topics": [
      "Quy trình phát triển phần mềm",
      "Mô hình thác nước, Agile và Scrum",
      "Thu thập và đặc tả yêu cầu",
      "Use Case và User Story",
      "Thiết kế kiến trúc phần mềm",
      "Quản lý cấu hình với Git",
      "Ước lượng và quản lý dự án",
      "Bảo trì và tiến hóa phần mềm"
    ],
    "points": [
      "Scrum chia dự án thành các Sprint có độ dài cố định từ 1 đến 4 tuần.",
      "Product Owner chịu trách nhiệm sắp xếp thứ tự ưu tiên của Product Backlog.",
      "Yêu cầu phi chức năng mô tả chất lượng hệ thống như hiệu năng, bảo mật.",
      "User Story thường theo mẫu: Là <vai trò>, tôi muốn <mục tiêu> để <lợi ích>.",
      "Mô hình thác nước phù hợp khi yêu cầu rõ ràng và ít thay đổi.",
      "Daily Scrum giới hạn trong 15 phút và tập trung vào mục tiêu Sprint."
    ],
    "para": [
      "Kỹ thuật phần mềm là việc áp dụng một cách tiếp cận có hệ thống, có kỷ luật và định lượng được vào quá trình phát triển, vận hành và bảo trì phần mềm. Mục tiêu là tạo ra sản phẩm đúng yêu cầu, đúng hạn và trong ngân sách cho phép.",
      "Khác với mô hình thác nước, các phương pháp Agile chấp nhận sự thay đổi yêu cầu như một phần tất yếu của dự án. Sản phẩm được phát triển tăng dần qua nhiều vòng lặp ngắn, mỗi vòng đều tạo ra phần mềm có thể chạy được."
    ],
    "questions": [
      "So sánh mô hình thác nước và mô hình Scrum. Nêu một tình huống dự án phù hợp với từng mô hình.",
      "Viết 5 User Story cho chức năng đặt lịch khám bệnh trực tuyến, kèm tiêu chí chấp nhận (acceptance criteria).",
      "Trình bày quy trình làm việc với Git theo mô hình feature branch. Vẽ sơ đồ minh họa.",
      "Một dự án có 120 story point, vận tốc trung bình của nhóm là 18 point/Sprint. Ước lượng số Sprint cần thiết và giải thích các rủi ro."
    ],
    "icon": "workflow"
  },
  "web": {
    "id": "web",
    "code": "WED201",
    "tab": "orange",
    "fig": "browser",
    "about": "Building for the web from semantic HTML and modern CSS layout through JavaScript, REST APIs and deployment.",
    "topics": [
      "HTML5 ngữ nghĩa",
      "CSS: Flexbox và Grid",
      "Thiết kế responsive",
      "JavaScript và DOM",
      "Fetch API và JSON",
      "RESTful API với Node.js/Express",
      "Xác thực người dùng với JWT",
      "Triển khai ứng dụng web"
    ],
    "points": [
      "Thẻ ngữ nghĩa như <header>, <main>, <article> giúp trình đọc màn hình hiểu cấu trúc trang.",
      "Flexbox phù hợp bố cục một chiều, Grid phù hợp bố cục hai chiều.",
      "Media query cho phép thay đổi giao diện theo kích thước màn hình.",
      "Event delegation giúp giảm số lượng listener khi danh sách có nhiều phần tử.",
      "Mã trạng thái HTTP 201 cho biết tài nguyên đã được tạo thành công.",
      "JWT gồm ba phần: header, payload và signature."
    ],
    "para": [
      "CSS Grid là hệ thống bố cục hai chiều cho phép chia trang thành các hàng và cột. Kết hợp với hàm minmax() và từ khóa auto-fill, ta có thể tạo lưới sản phẩm tự co giãn theo màn hình mà không cần media query.",
      "Khi xây dựng API, nên tuân theo các quy ước REST: dùng danh từ số nhiều cho tài nguyên, dùng đúng phương thức HTTP và trả về mã trạng thái phù hợp. Điều này giúp phía client dễ tích hợp và dễ bảo trì."
    ],
    "questions": [
      "Xây dựng bố cục trang chủ gồm header, sidebar, nội dung chính và footer bằng CSS Grid. Trang phải hiển thị tốt trên màn hình dưới 768px.",
      "Viết hàm JavaScript gọi API /api/products, hiển thị danh sách sản phẩm và xử lý trường hợp lỗi mạng.",
      "Thiết kế các endpoint RESTful cho chức năng quản lý giỏ hàng. Nêu phương thức HTTP và mã trạng thái trả về."
    ],
    "snippet": {
      "lang": "JavaScript",
      "lines": [
        "app.get('/api/books', async (req, res) => {",
        "  const { q = '', page = 1 } = req.query;",
        "  const books = await Book.find({",
        "    title: { $regex: q, $options: 'i' }",
        "  }).skip((page - 1) * 12).limit(12);",
        "  res.status(200).json({ data: books, page });",
        "});"
      ]
    },
    "icon": "code-xml"
  },
  "oop": {
    "id": "oop",
    "code": "PRO192",
    "tab": "amber",
    "fig": "uml",
    "about": "Object-oriented thinking with Java: classes, encapsulation, inheritance, polymorphism, interfaces, exceptions and the Collections Framework.",
    "topics": [
      "Lớp và đối tượng trong Java",
      "Đóng gói và phạm vi truy cập",
      "Kế thừa",
      "Đa hình và lớp trừu tượng",
      "Interface",
      "Xử lý ngoại lệ",
      "Collections Framework",
      "Design pattern cơ bản"
    ],
    "points": [
      "Đóng gói che giấu dữ liệu bằng private và cung cấp getter/setter.",
      "Một lớp chỉ kế thừa trực tiếp một lớp cha nhưng có thể cài đặt nhiều interface.",
      "Đa hình động được quyết định tại thời điểm chạy thông qua ghi đè phương thức.",
      "Lớp trừu tượng có thể chứa cả phương thức có thân và không có thân.",
      "Checked exception phải được khai báo hoặc xử lý bằng try-catch.",
      "ArrayList truy cập theo chỉ số nhanh, LinkedList chèn xóa ở đầu nhanh."
    ],
    "para": [
      "Đa hình (polymorphism) cho phép một biến kiểu lớp cha tham chiếu đến đối tượng của lớp con. Khi gọi phương thức đã được ghi đè, Java sẽ thực thi phiên bản của lớp con tại thời điểm chạy.",
      "Nhờ đa hình, ta có thể viết mã xử lý chung cho nhiều loại đối tượng, chẳng hạn tính tổng diện tích của một danh sách gồm hình tròn, hình chữ nhật và tam giác mà không cần kiểm tra kiểu cụ thể."
    ],
    "questions": [
      "Xây dựng lớp Student gồm mã sinh viên, họ tên, điểm GPA. Cài đặt các phương thức khởi tạo, getter/setter và toString().",
      "Viết chương trình quản lý danh sách nhân viên (full-time, part-time) sử dụng kế thừa và đa hình để tính lương.",
      "Phân biệt interface và abstract class. Khi nào nên sử dụng mỗi loại? Cho ví dụ minh họa."
    ],
    "snippet": {
      "lang": "Java",
      "lines": [
        "public abstract class Shape {",
        "    public abstract double area();",
        "}",
        "",
        "public class Circle extends Shape {",
        "    private final double r;",
        "    public Circle(double r) { this.r = r; }",
        "    @Override",
        "    public double area() { return Math.PI * r * r; }",
        "}"
      ]
    },
    "icon": "package"
  },
  "net": {
    "id": "net",
    "code": "NWC203",
    "tab": "blue",
    "fig": "layers",
    "about": "How data moves between machines: the OSI and TCP/IP models, addressing and subnetting, routing, transport protocols and core application services.",
    "topics": [
      "Mô hình OSI và TCP/IP",
      "Tầng vật lý và tầng liên kết dữ liệu",
      "Địa chỉ IPv4 và chia subnet",
      "Định tuyến tĩnh và động",
      "TCP, UDP và kiểm soát tắc nghẽn",
      "DNS, HTTP và DHCP",
      "VLAN và chuyển mạch",
      "An ninh mạng cơ bản"
    ],
    "points": [
      "Mô hình OSI gồm 7 tầng, mô hình TCP/IP gồm 4 tầng.",
      "Subnet /26 chia một mạng /24 thành 4 mạng con, mỗi mạng 62 host.",
      "TCP thiết lập kết nối bằng bắt tay ba bước SYN, SYN-ACK, ACK.",
      "UDP không đảm bảo thứ tự nhưng có độ trễ thấp, phù hợp truyền video.",
      "Switch hoạt động ở tầng 2, router hoạt động ở tầng 3.",
      "DHCP cấp phát địa chỉ IP động theo quy trình DORA."
    ],
    "para": [
      "Chia mạng con (subnetting) là kỹ thuật mượn một số bit trong phần host để tạo thêm các mạng nhỏ hơn. Việc này giúp sử dụng hiệu quả không gian địa chỉ, giảm miền quảng bá và tăng tính bảo mật.",
      "Để chia subnet, trước hết xác định số mạng con cần thiết và số host tối đa trong mỗi mạng. Từ đó tính số bit cần mượn, subnet mask mới và dải địa chỉ của từng mạng con."
    ],
    "questions": [
      "Cho địa chỉ mạng 172.16.0.0/16. Chia thành các mạng con sao cho mỗi mạng chứa tối thiểu 500 host. Liệt kê 4 mạng con đầu tiên.",
      "Trình bày quá trình bắt tay ba bước của TCP. Điều gì xảy ra nếu gói SYN-ACK bị mất?",
      "So sánh định tuyến tĩnh và định tuyến động. Nêu ưu nhược điểm của giao thức OSPF."
    ],
    "snippet": {
      "lang": "Cisco IOS",
      "lines": [
        "Router(config)# interface g0/0.10",
        "Router(config-subif)# encapsulation dot1Q 10",
        "Router(config-subif)# ip address 192.168.10.1 255.255.255.0",
        "Router(config)# interface g0/0.20",
        "Router(config-subif)# encapsulation dot1Q 20",
        "Router(config-subif)# ip address 192.168.20.1 255.255.255.0"
      ]
    },
    "icon": "network"
  },
  "test": {
    "id": "test",
    "code": "SWT301",
    "tab": "rose",
    "fig": "table",
    "about": "Testing principles and techniques: test levels, black-box and white-box design, writing test cases and plans, unit testing and UI automation.",
    "topics": [
      "Nguyên lý kiểm thử phần mềm",
      "Các mức kiểm thử",
      "Kỹ thuật hộp đen",
      "Kỹ thuật hộp trắng",
      "Test case và test plan",
      "Kiểm thử đơn vị với JUnit",
      "Kiểm thử tự động với Selenium",
      "Quản lý lỗi và báo cáo"
    ],
    "points": [
      "Kiểm thử chỉ chứng minh được sự có mặt của lỗi, không chứng minh được phần mềm không có lỗi.",
      "Phân vùng tương đương giúp giảm số lượng test case mà vẫn bao phủ dữ liệu đầu vào.",
      "Phân tích giá trị biên tập trung vào các giá trị tại và quanh ranh giới.",
      "Độ phủ nhánh (branch coverage) mạnh hơn độ phủ lệnh (statement coverage).",
      "Kiểm thử hồi quy đảm bảo thay đổi mới không làm hỏng chức năng cũ.",
      "Một báo cáo lỗi tốt cần có bước tái hiện, kết quả thực tế và kết quả mong đợi."
    ],
    "para": [
      "Kỹ thuật phân tích giá trị biên dựa trên quan sát rằng lỗi thường xuất hiện tại ranh giới của miền dữ liệu. Với trường tuổi hợp lệ từ 18 đến 60, các giá trị cần kiểm thử là 17, 18, 19, 59, 60 và 61.",
      "Test case nên được viết sao cho người khác có thể thực hiện lại mà không cần hỏi thêm. Mỗi test case gồm mã định danh, điều kiện tiên quyết, các bước thực hiện, dữ liệu kiểm thử và kết quả mong đợi."
    ],
    "questions": [
      "Áp dụng kỹ thuật phân vùng tương đương và giá trị biên để thiết kế test case cho chức năng đăng ký tài khoản (tên đăng nhập 6–20 ký tự, mật khẩu ≥ 8 ký tự).",
      "Vẽ đồ thị luồng điều khiển cho đoạn mã sau và tính độ phức tạp chu trình (cyclomatic complexity).",
      "Viết báo cáo lỗi (bug report) cho tình huống: người dùng thanh toán thành công nhưng đơn hàng không xuất hiện trong lịch sử."
    ],
    "snippet": {
      "lang": "Java",
      "lines": [
        "@Test",
        "void shouldRejectAgeBelowMinimum() {",
        "    Validator v = new Validator();",
        "    assertFalse(v.isValidAge(17));",
        "    assertTrue(v.isValidAge(18));",
        "}"
      ]
    },
    "icon": "bug"
  },
  "sad": {
    "id": "sad",
    "code": "SAD302",
    "tab": "slate",
    "fig": "uml",
    "about": "Turning a real business into a system specification: surveying the current state, functional decomposition, data flow diagrams and UML models.",
    "topics": [
      "Tổng quan về phân tích hệ thống",
      "Khảo sát hiện trạng và xác định yêu cầu",
      "Sơ đồ phân rã chức năng (BFD)",
      "Sơ đồ luồng dữ liệu (DFD)",
      "Mô hình hóa với UML",
      "Sơ đồ lớp và sơ đồ tuần tự",
      "Thiết kế cơ sở dữ liệu",
      "Thiết kế giao diện"
    ],
    "points": [
      "Sơ đồ phân rã chức năng mô tả hệ thống theo cấu trúc cây từ tổng quát đến chi tiết.",
      "DFD mức ngữ cảnh chỉ có một tiến trình duy nhất đại diện cho toàn hệ thống.",
      "Sơ đồ Use Case thể hiện tương tác giữa tác nhân và hệ thống.",
      "Quan hệ include là bắt buộc, quan hệ extend là tùy chọn.",
      "Sơ đồ tuần tự thể hiện thứ tự trao đổi thông điệp theo thời gian.",
      "Mỗi lớp trong sơ đồ lớp gồm tên lớp, thuộc tính và phương thức."
    ],
    "para": [
      "Giai đoạn khảo sát hiện trạng nhằm hiểu rõ cách tổ chức đang vận hành: ai làm gì, dữ liệu nào được sử dụng và những vấn đề nào đang tồn tại. Các phương pháp thường dùng gồm phỏng vấn, bảng hỏi, quan sát và nghiên cứu tài liệu.",
      "Kết quả khảo sát được tổng hợp thành tài liệu đặc tả yêu cầu, làm cơ sở cho việc xây dựng sơ đồ phân rã chức năng, sơ đồ luồng dữ liệu và mô hình dữ liệu ở các bước tiếp theo."
    ],
    "questions": [
      "Vẽ sơ đồ Use Case tổng quát cho hệ thống quản lý khách sạn gồm các tác nhân: Lễ tân, Khách hàng, Quản lý.",
      "Xây dựng DFD mức 0 và mức 1 cho chức năng “Đặt phòng”.",
      "Vẽ sơ đồ tuần tự cho kịch bản khách hàng đặt phòng trực tuyến và thanh toán."
    ],
    "icon": "layers"
  },
  "dm": {
    "id": "dm",
    "code": "MAD101",
    "tab": "plum",
    "fig": "truth",
    "about": "The mathematics behind computing: logic, sets, proofs, relations, counting, Boolean algebra and an introduction to graphs.",
    "topics": [
      "Logic mệnh đề",
      "Vị từ và lượng từ",
      "Tập hợp và ánh xạ",
      "Phương pháp chứng minh và quy nạp",
      "Quan hệ và quan hệ tương đương",
      "Tổ hợp và nguyên lý chuồng bồ câu",
      "Đại số Boole",
      "Lý thuyết đồ thị cơ bản"
    ],
    "points": [
      "Mệnh đề p → q chỉ sai khi p đúng và q sai.",
      "Phủ định của ∀x P(x) là ∃x ¬P(x).",
      "Quan hệ tương đương có tính phản xạ, đối xứng và bắc cầu.",
      "Số cách chọn k phần tử từ n phần tử là C(n, k) = n! / (k!(n − k)!).",
      "Đồ thị có chu trình Euler khi mọi đỉnh đều có bậc chẵn.",
      "Quy nạp gồm bước cơ sở và bước quy nạp."
    ],
    "para": [
      "Phương pháp quy nạp toán học dùng để chứng minh một mệnh đề P(n) đúng với mọi số tự nhiên n ≥ n₀. Ta chứng minh P(n₀) đúng, sau đó giả sử P(k) đúng và chứng minh P(k + 1) cũng đúng.",
      "Ví dụ, để chứng minh 1 + 2 + … + n = n(n + 1)/2, ta kiểm tra với n = 1, sau đó cộng thêm k + 1 vào hai vế của giả thiết quy nạp và biến đổi về dạng (k + 1)(k + 2)/2."
    ],
    "questions": [
      "Lập bảng chân trị của mệnh đề (p → q) ∧ (q → r) → (p → r). Mệnh đề này có phải là hằng đúng không?",
      "Chứng minh bằng quy nạp: 3ⁿ − 1 chia hết cho 2 với mọi n ≥ 1.",
      "Có bao nhiêu xâu nhị phân độ dài 10 chứa đúng ba bit 1?",
      "Cho quan hệ R trên tập {1, 2, 3, 4}. Kiểm tra R có phải quan hệ tương đương không và tìm các lớp tương đương."
    ],
    "icon": "sigma"
  },
  "os": {
    "id": "os",
    "code": "OSG202",
    "tab": "green",
    "fig": "gantt",
    "about": "What happens beneath your programs: processes and threads, CPU scheduling, synchronisation, deadlock, memory management and file systems.",
    "topics": [
      "Tổng quan hệ điều hành",
      "Tiến trình và luồng",
      "Lập lịch CPU",
      "Đồng bộ hóa và semaphore",
      "Deadlock",
      "Quản lý bộ nhớ và phân trang",
      "Bộ nhớ ảo",
      "Hệ thống tập tin"
    ],
    "points": [
      "Round Robin cấp cho mỗi tiến trình một khoảng thời gian (quantum) cố định.",
      "SJF cho thời gian chờ trung bình nhỏ nhất nhưng khó biết trước thời gian chạy.",
      "Deadlock xảy ra khi đồng thời thỏa bốn điều kiện Coffman.",
      "Thuật toán Banker kiểm tra trạng thái an toàn trước khi cấp phát tài nguyên.",
      "Lỗi trang (page fault) xảy ra khi trang cần truy cập chưa nằm trong RAM.",
      "LRU thay thế trang không được sử dụng lâu nhất."
    ],
    "para": [
      "Lập lịch CPU quyết định tiến trình nào trong hàng đợi sẵn sàng sẽ được cấp CPU tiếp theo. Các tiêu chí đánh giá gồm thời gian chờ trung bình, thời gian hoàn thành, thông lượng và mức độ sử dụng CPU.",
      "Với thuật toán Round Robin, nếu quantum quá lớn, thuật toán trở thành FCFS; nếu quantum quá nhỏ, chi phí chuyển ngữ cảnh tăng đáng kể. Thông thường quantum được chọn sao cho khoảng 80% các chu kỳ CPU ngắn hơn quantum."
    ],
    "questions": [
      "Cho 5 tiến trình với thời điểm đến và thời gian xử lý như bảng. Vẽ biểu đồ Gantt và tính thời gian chờ trung bình theo FCFS, SJF và Round Robin (q = 4).",
      "Áp dụng thuật toán Banker để kiểm tra hệ thống có ở trạng thái an toàn không. Nếu có, chỉ ra một chuỗi an toàn.",
      "Với chuỗi tham chiếu trang 7, 0, 1, 2, 0, 3, 0, 4, 2, 3 và 3 khung trang, tính số lỗi trang theo FIFO, LRU và OPT."
    ],
    "snippet": {
      "lang": "C",
      "lines": [
        "sem_t mutex, empty, full;",
        "",
        "void *producer(void *arg) {",
        "    sem_wait(&empty);",
        "    sem_wait(&mutex);",
        "    buffer[in] = produce_item();",
        "    in = (in + 1) % N;",
        "    sem_post(&mutex);",
        "    sem_post(&full);",
        "}"
      ]
    },
    "icon": "cpu"
  },
  "ai": {
    "id": "ai",
    "code": "AIL303",
    "tab": "teal",
    "fig": "graph",
    "about": "Foundations of AI: intelligent agents, uninformed and heuristic search, adversarial search, constraint satisfaction, logic and an introduction to machine learning.",
    "topics": [
      "Tác tử thông minh",
      "Tìm kiếm mù: BFS, DFS, UCS",
      "Tìm kiếm heuristic và A*",
      "Tìm kiếm đối kháng: Minimax",
      "Bài toán thỏa mãn ràng buộc",
      "Logic và suy diễn",
      "Học máy cơ bản",
      "Mạng nơ-ron nhân tạo"
    ],
    "points": [
      "A* chọn nút có f(n) = g(n) + h(n) nhỏ nhất để mở rộng.",
      "Heuristic chấp nhận được không bao giờ ước lượng vượt quá chi phí thực.",
      "BFS đảm bảo tìm lời giải nông nhất, UCS đảm bảo lời giải chi phí thấp nhất.",
      "Cắt tỉa Alpha-beta không làm thay đổi kết quả của Minimax.",
      "Môi trường của tác tử có thể quan sát đầy đủ hoặc một phần.",
      "Hàm kích hoạt ReLU giúp giảm hiện tượng tiêu biến gradient."
    ],
    "para": [
      "Thuật toán A* kết hợp chi phí thực tế g(n) từ trạng thái đầu đến nút n với ước lượng h(n) từ n đến đích. Nếu h(n) là heuristic chấp nhận được, A* đảm bảo tìm được lời giải tối ưu.",
      "Trong bài toán tìm đường trên bản đồ, khoảng cách đường chim bay là một heuristic chấp nhận được, vì đường đi thực tế giữa hai điểm không thể ngắn hơn đường thẳng nối chúng."
    ],
    "questions": [
      "Cho đồ thị trạng thái và hàm heuristic trong Hình 2. Thực hiện thuật toán A* từ S đến G, ghi rõ tập OPEN và CLOSED sau mỗi bước.",
      "Áp dụng Minimax có cắt tỉa Alpha-beta trên cây trò chơi. Đánh dấu các nhánh bị cắt.",
      "Biểu diễn bài toán tô màu bản đồ dưới dạng bài toán thỏa mãn ràng buộc (CSP)."
    ],
    "snippet": {
      "lang": "Python",
      "lines": [
        "def a_star(start, goal, h):",
        "    frontier = [(h(start), 0, start)]",
        "    g = {start: 0}",
        "    while frontier:",
        "        f, cost, node = heappop(frontier)",
        "        if node == goal:",
        "            return cost",
        "        for nxt, w in graph[node]:",
        "            if cost + w < g.get(nxt, inf):",
        "                g[nxt] = cost + w",
        "                heappush(frontier, (g[nxt] + h(nxt), g[nxt], nxt))"
      ]
    },
    "icon": "brain"
  },
  "micro": {
    "id": "micro",
    "code": "ECO111",
    "tab": "green",
    "fig": "curve",
    "about": "How households and firms make decisions and interact in markets: supply and demand, elasticity, consumer choice, costs and market structures.",
    "topics": [
      "Mười nguyên lý của kinh tế học",
      "Cung, cầu và cân bằng thị trường",
      "Độ co giãn",
      "Lý thuyết hành vi người tiêu dùng",
      "Lý thuyết sản xuất và chi phí",
      "Thị trường cạnh tranh hoàn hảo",
      "Độc quyền",
      "Thất bại thị trường"
    ],
    "points": [
      "Giá cân bằng được xác định tại giao điểm của đường cung và đường cầu.",
      "Cầu co giãn khi độ co giãn theo giá có trị tuyệt đối lớn hơn 1.",
      "Giá trần thấp hơn giá cân bằng gây ra thiếu hụt hàng hóa.",
      "Doanh nghiệp cạnh tranh hoàn hảo sản xuất tại mức MR = MC.",
      "Chi phí cơ hội là giá trị của phương án tốt nhất bị bỏ qua.",
      "Thặng dư tiêu dùng là phần diện tích nằm dưới đường cầu và trên mức giá."
    ],
    "para": [
      "Trạng thái cân bằng thị trường đạt được khi lượng cung bằng lượng cầu. Tại mức giá cao hơn giá cân bằng, thị trường dư thừa và áp lực giảm giá xuất hiện; ngược lại, ở mức giá thấp hơn, thị trường thiếu hụt và giá có xu hướng tăng.",
      "Khi thu nhập của người tiêu dùng tăng, đường cầu đối với hàng hóa thông thường dịch chuyển sang phải, làm tăng cả giá và lượng cân bằng. Đối với hàng hóa thứ cấp, đường cầu dịch chuyển theo hướng ngược lại."
    ],
    "questions": [
      "Cho hàm cầu Qd = 120 − 2P và hàm cung Qs = 3P − 30. Xác định giá và lượng cân bằng. Tính thặng dư tiêu dùng và thặng dư sản xuất.",
      "Chính phủ áp đặt mức thuế 5 nghìn đồng/sản phẩm đánh vào người bán. Xác định điểm cân bằng mới và phần thuế mỗi bên chịu.",
      "Phân biệt sự trượt dọc trên đường cầu và sự dịch chuyển của đường cầu. Cho ví dụ."
    ],
    "table": {
      "head": [
        "Giá (nghìn đồng)",
        "Lượng cầu",
        "Lượng cung"
      ],
      "rows": [
        [
          "10",
          "120",
          "40"
        ],
        [
          "20",
          "100",
          "60"
        ],
        [
          "30",
          "80",
          "80"
        ],
        [
          "40",
          "60",
          "100"
        ],
        [
          "50",
          "40",
          "120"
        ]
      ]
    },
    "icon": "chart-line"
  },
  "acc": {
    "id": "acc",
    "code": "ACC101",
    "tab": "amber",
    "fig": "table",
    "about": "The language of business: financial statements, double-entry bookkeeping, recording core business processes and the Vietnamese accounting system.",
    "topics": [
      "Tổng quan về kế toán",
      "Báo cáo tài chính",
      "Tài khoản và ghi sổ kép",
      "Kế toán các quá trình kinh doanh",
      "Tính giá các đối tượng kế toán",
      "Chứng từ kế toán",
      "Sổ kế toán và hình thức kế toán",
      "Kiểm kê tài sản"
    ],
    "points": [
      "Tổng tài sản luôn bằng tổng nguồn vốn.",
      "Tài khoản tài sản tăng ghi bên Nợ, giảm ghi bên Có.",
      "Mỗi nghiệp vụ kinh tế ảnh hưởng đến ít nhất hai tài khoản.",
      "Bảng cân đối kế toán phản ánh tình hình tài chính tại một thời điểm.",
      "Giá vốn hàng bán được tính theo phương pháp FIFO hoặc bình quân gia quyền.",
      "Chứng từ gốc là căn cứ pháp lý để ghi sổ kế toán."
    ],
    "para": [
      "Nguyên tắc ghi sổ kép yêu cầu mỗi nghiệp vụ kinh tế phát sinh phải được ghi vào ít nhất hai tài khoản có liên quan, một bên Nợ và một bên Có, với số tiền bằng nhau. Nhờ đó, tổng số phát sinh bên Nợ luôn bằng tổng số phát sinh bên Có.",
      "Ví dụ, khi doanh nghiệp mua nguyên vật liệu trị giá 50 triệu đồng chưa thanh toán cho người bán, kế toán ghi Nợ TK 152 – Nguyên liệu, vật liệu và Có TK 331 – Phải trả người bán."
    ],
    "questions": [
      "Định khoản các nghiệp vụ kinh tế phát sinh trong tháng 10 tại Công ty TNHH An Phát.",
      "Lập bảng cân đối kế toán tại ngày 31/10 dựa trên số dư các tài khoản.",
      "Tính giá xuất kho nguyên vật liệu theo phương pháp FIFO và bình quân gia quyền cuối kỳ."
    ],
    "table": {
      "head": [
        "Ngày",
        "Diễn giải",
        "TK Nợ",
        "TK Có",
        "Số tiền"
      ],
      "rows": [
        [
          "02/10",
          "Mua NVL chưa trả tiền",
          "152",
          "331",
          "50.000.000"
        ],
        [
          "05/10",
          "Rút TGNH nhập quỹ",
          "111",
          "112",
          "20.000.000"
        ],
        [
          "08/10",
          "Xuất NVL cho sản xuất",
          "621",
          "152",
          "35.000.000"
        ],
        [
          "12/10",
          "Trả lương nhân viên",
          "334",
          "111",
          "18.500.000"
        ]
      ]
    },
    "icon": "calculator"
  },
  "theory": {
    "id": "theory",
    "code": "",
    "tab": "plum",
    "fig": null,
    "about": "Môn học nền tảng về lý luận, ngôn ngữ và kỹ năng.",
    "topics": [
      "Khái niệm và đối tượng nghiên cứu",
      "Cơ sở hình thành",
      "Nội dung cơ bản",
      "Ý nghĩa và vận dụng",
      "Liên hệ thực tiễn",
      "Ôn tập tổng hợp"
    ],
    "points": [
      "Nắm chắc khái niệm trước khi học thuộc nội dung chi tiết",
      "Mỗi luận điểm cần đi kèm một ví dụ thực tiễn",
      "Phân biệt rõ nguyên nhân, điều kiện và kết quả",
      "Hệ thống hóa kiến thức bằng sơ đồ tư duy theo chương",
      "Câu hỏi tự luận thường yêu cầu phân tích và liên hệ bản thân",
      "Ôn theo đề cương, chú ý các mốc và thuật ngữ quan trọng"
    ],
    "para": [
      "Nội dung môn học được trình bày theo trình tự từ khái niệm, cơ sở hình thành đến nội dung cơ bản và ý nghĩa thực tiễn. Mỗi chương đều có phần tóm tắt và câu hỏi ôn tập ở cuối.",
      "Khi làm bài tự luận, sinh viên cần nêu được luận điểm chính, phân tích có dẫn chứng và liên hệ với thực tiễn. Bài làm được đánh giá cao khi lập luận chặt chẽ và trình bày mạch lạc."
    ],
    "questions": [
      "Trình bày khái niệm và các đặc điểm cơ bản của nội dung đã học trong chương 1. Cho ví dụ minh họa.",
      "Phân tích cơ sở hình thành và ý nghĩa của vấn đề nêu trên đối với thực tiễn hiện nay.",
      "Liên hệ với bản thân: sinh viên cần làm gì để vận dụng những nội dung này trong học tập và cuộc sống?"
    ]
  }
} as Record<string, PaperProfile>;

/** Which discipline a course code belongs to, by its prefix. */
const PREFIX_TO_PROFILE: Array<[RegExp, string]> = [
  [/^(CSD|CO2003)/, 'dsa'],
  [/^(DBI|CO2013)/, 'db'],
  [/^(SWT)/, 'test'],
  [/^(SWD|SAD)/, 'sad'],
  [/^(SWE|SWR|SWP|PMG|CO3001)/, 'swe'],
  [/^(WED|FER|WDP|WDU|MMA|PRM|SDN)/, 'web'],
  [/^(PRO|PRF|LAB|PRJ|CO1003)/, 'oop'],
  [/^(NWC|IOT)/, 'net'],
  [/^(MAD|MAE|MAS)/, 'dm'],
  [/^(OSG|CEA|CSI)/, 'os'],
  [/^(AIL|AI)/, 'ai'],
  [/^(ECO|EXE)/, 'micro'],
  [/^(ACC)/, 'acc'],
];

export function profileFor(code: string): PaperProfile {
  const upper = code.toUpperCase();
  for (const [pattern, id] of PREFIX_TO_PROFILE) if (pattern.test(upper)) return PROFILES[id];
  return PROFILES.theory;
}

/** The colour of a subject's tab, shared by cards, chips and the subject workspace. */
export function subjectTone(code: string): { c: string; t: string } {
  return TAB_COLORS[profileFor(code).tab];
}
