/**
 * FPT University — Software Engineering (Kỹ thuật phần mềm), terms 1 to 9.
 *
 * The requirement rules follow the programme's prerequisite table:
 *   "Pass môn"                 → { min: 'pass' }   (pass mark 5.0)
 *   "Điểm lớn hơn hoặc bằng 4" → { min: 4 }
 * OJT202 additionally needs terms 1–5 owed by no more than two subjects, and
 * every subject of terms 7, 8 and 9 needs OJT202 passed. The graduation
 * options (SE_GRA_ELE, EXE404) carry the three/four conditions of the
 * programme's capstone table.
 *
 * Where the source table was ambiguous the reading taken is noted inline.
 */
import type { Requirement } from '@kaned/shared';

type Semester = 'S1' | 'S2' | 'SUMMER';

export interface CurriculumEntry {
  code: string;
  name: string;
  nameVi: string;
  credits: number;
  termNo: number;
  description: string;
  topics: string[];
  outcomes?: string[];
  assessment?: string;
  requirements?: Requirement[];
  choiceGroup?: string;
}

const pass = (...codes: string[]): Requirement => ({ kind: 'subject', codes, min: 'pass' });
const atLeast4 = (...codes: string[]): Requirement => ({ kind: 'subject', codes, min: 4 });

/** Three FPT terms make one academic year: Spring, Summer, Fall. */
export function termToYear(termNo: number): { year: number; semester: Semester } {
  const year = Math.ceil(termNo / 3);
  const slot = (termNo - 1) % 3;
  return { year, semester: slot === 0 ? 'S1' : slot === 1 ? 'S2' : 'SUMMER' };
}

const BASE: CurriculumEntry[] = [
  /* ─────────────────────────────── Kỳ 1 ─────────────────────────────── */
  {
    code: 'PRF192', name: 'Programming Fundamentals', nameVi: 'Cơ sở lập trình',
    credits: 3, termNo: 1,
    description: 'Môn lập trình đầu tiên, dạy bằng ngôn ngữ C: biến, cấu trúc điều khiển, hàm, mảng, con trỏ và xử lý tập tin.',
    topics: ['Biến, kiểu dữ liệu và toán tử', 'Cấu trúc điều khiển', 'Hàm và truyền tham số', 'Mảng và chuỗi ký tự', 'Con trỏ và cấp phát động', 'Cấu trúc và tập tin'],
    outcomes: ['Viết được chương trình C hoàn chỉnh cho bài toán nhỏ', 'Dùng mảng, con trỏ, cấu trúc đúng cách và gỡ lỗi được chương trình'],
    assessment: 'Workshop 10% · Progress test 20% · Assignment 20% · Practical exam 20% · Final exam 30%',
  },
  {
    code: 'CEA201', name: 'Computer Organization and Architecture', nameVi: 'Tổ chức và kiến trúc máy tính',
    credits: 3, termNo: 1,
    description: 'Máy tính hoạt động thế nào ở mức phần cứng: biểu diễn dữ liệu, CPU, bộ nhớ, tập lệnh và hợp ngữ.',
    topics: ['Biểu diễn số và dữ liệu', 'Cổng logic và mạch số', 'Kiến trúc CPU', 'Tập lệnh và hợp ngữ', 'Hệ thống bộ nhớ và cache', 'Thiết bị vào ra'],
    outcomes: ['Giải thích được đường đi của một lệnh trong CPU', 'Chuyển đổi và tính toán trên các hệ cơ số'],
  },
  {
    code: 'CSI104', name: 'Introduction to Computing', nameVi: 'Nhập môn khoa học máy tính',
    credits: 3, termNo: 1,
    description: 'Bức tranh toàn cảnh về ngành: thuật toán, hệ điều hành, mạng, cơ sở dữ liệu, an toàn thông tin và đạo đức nghề nghiệp.',
    topics: ['Hệ thống số và dữ liệu', 'Thuật toán và giải quyết vấn đề', 'Hệ điều hành', 'Mạng và Internet', 'Cơ sở dữ liệu', 'An toàn thông tin'],
  },
  {
    code: 'MAE101', name: 'Mathematics for Engineering', nameVi: 'Toán cho ngành kỹ thuật',
    credits: 3, termNo: 1,
    description: 'Giải tích và đại số tuyến tính cho ngành máy tính: giới hạn, đạo hàm, tích phân, ma trận và hệ phương trình.',
    topics: ['Giới hạn và liên tục', 'Đạo hàm và ứng dụng', 'Tích phân', 'Ma trận và định thức', 'Hệ phương trình tuyến tính', 'Không gian vector'],
  },
  {
    code: 'SSL101c', name: 'Academic Skills for University Success', nameVi: 'Kỹ năng học tập đại học',
    credits: 3, termNo: 1,
    description: 'Kỹ năng học tập ở đại học: quản lý thời gian, đọc hiểu, ghi chép, tư duy phản biện và liêm chính học thuật.',
    topics: ['Quản lý thời gian', 'Đọc và ghi chép hiệu quả', 'Tư duy phản biện', 'Liêm chính học thuật'],
  },

  /* ─────────────────────────────── Kỳ 2 ─────────────────────────────── */
  {
    code: 'PRO192', name: 'Object-Oriented Programming', nameVi: 'Lập trình hướng đối tượng',
    credits: 3, termNo: 2,
    description: 'Thiết kế hướng đối tượng bằng Java: đóng gói, kế thừa, đa hình, interface, ngoại lệ và Collections.',
    topics: ['Lớp và đối tượng trong Java', 'Đóng gói và phạm vi truy cập', 'Kế thừa', 'Đa hình và lớp trừu tượng', 'Interface', 'Xử lý ngoại lệ', 'Collections Framework'],
    outcomes: ['Thiết kế được lớp và quan hệ giữa các lớp', 'Áp dụng đa hình để viết mã dễ mở rộng'],
    assessment: 'Workshop 10% · Progress test 10% · Assignment 20% · Practical exam 30% · Final exam 30%',
    requirements: [pass('PRF192')],
  },
  {
    code: 'OSG202', name: 'Operating Systems', nameVi: 'Hệ điều hành',
    credits: 3, termNo: 2,
    description: 'Tiến trình, luồng, lập lịch CPU, đồng bộ hoá, deadlock, quản lý bộ nhớ và hệ thống tập tin.',
    topics: ['Tiến trình và luồng', 'Lập lịch CPU', 'Đồng bộ hoá', 'Deadlock', 'Bộ nhớ ảo', 'Hệ thống tập tin'],
  },
  {
    code: 'NWC204', name: 'Computer Networking', nameVi: 'Mạng máy tính',
    credits: 3, termNo: 2,
    description: 'Mô hình OSI và TCP/IP, địa chỉ IP và chia subnet, định tuyến, chuyển mạch và các giao thức tầng ứng dụng.',
    topics: ['Mô hình OSI và TCP/IP', 'Tầng vật lý và liên kết dữ liệu', 'Địa chỉ IPv4 và chia subnet', 'Định tuyến', 'TCP và UDP', 'Giao thức tầng ứng dụng'],
  },
  {
    code: 'MAD101', name: 'Discrete Mathematics', nameVi: 'Toán rời rạc',
    credits: 3, termNo: 2,
    description: 'Logic, tập hợp, chứng minh, quan hệ, tổ hợp, đại số Boole và nhập môn lý thuyết đồ thị.',
    topics: ['Logic mệnh đề', 'Vị từ và lượng từ', 'Tập hợp và ánh xạ', 'Quy nạp toán học', 'Quan hệ', 'Tổ hợp', 'Đồ thị và cây'],
  },
  {
    code: 'SSG104', name: 'Communication and In-Group Working Skills', nameVi: 'Kỹ năng giao tiếp và làm việc nhóm',
    credits: 3, termNo: 2,
    description: 'Giao tiếp trong môi trường học tập và công việc, thuyết trình, phản hồi và làm việc nhóm hiệu quả.',
    topics: ['Giao tiếp hiệu quả', 'Thuyết trình', 'Làm việc nhóm', 'Giải quyết xung đột'],
  },

  /* ─────────────────────────────── Kỳ 3 ─────────────────────────────── */
  {
    code: 'LAB211', name: 'OOP with Java Lab', nameVi: 'Thực hành lập trình hướng đối tượng với Java',
    credits: 3, termNo: 3,
    description: 'Môn thực hành: tự xây dựng các ứng dụng Java console theo hướng đối tượng, chấm qua từng bài lab và bảo vệ.',
    topics: ['Phân tích đề bài lab', 'Thiết kế lớp', 'Collections và Generics', 'Đọc ghi tập tin', 'Kiểm thử và bảo vệ bài'],
    assessment: 'Chấm theo LOC đạt được qua các bài lab, có bảo vệ trực tiếp',
    requirements: [atLeast4('PRO192')],
  },
  {
    code: 'CSD201', name: 'Data Structures and Algorithms', nameVi: 'Cấu trúc dữ liệu và giải thuật',
    credits: 3, termNo: 3,
    description: 'Danh sách liên kết, ngăn xếp, hàng đợi, cây nhị phân tìm kiếm, AVL, bảng băm, đồ thị và các thuật toán sắp xếp.',
    topics: ['Độ phức tạp thuật toán và ký hiệu Big-O', 'Mảng và danh sách liên kết', 'Ngăn xếp và hàng đợi', 'Đệ quy và quay lui', 'Cây nhị phân tìm kiếm (BST)', 'Cây AVL và các phép xoay', 'Bảng băm', 'Đồ thị: BFS, DFS, Dijkstra', 'Các thuật toán sắp xếp'],
    outcomes: ['Chọn được cấu trúc dữ liệu phù hợp cho bài toán', 'Phân tích được độ phức tạp thời gian của thuật toán', 'Cài đặt được cây, bảng băm và các thuật toán trên đồ thị'],
    assessment: 'Workshop 10% · Progress test 20% · Assignment 20% · Final exam 50%',
    requirements: [atLeast4('PRO192')],
  },
  {
    code: 'DBI202', name: 'Database Systems', nameVi: 'Các hệ cơ sở dữ liệu',
    credits: 3, termNo: 3,
    description: 'Mô hình thực thể – liên kết, mô hình quan hệ, SQL, chuẩn hoá, chỉ mục và giao tác trên SQL Server.',
    topics: ['Mô hình ER', 'Mô hình quan hệ', 'SQL: truy vấn cơ bản và JOIN', 'GROUP BY và truy vấn lồng', 'Chuẩn hoá 1NF–BCNF', 'Chỉ mục, view, stored procedure', 'Giao tác'],
    outcomes: ['Thiết kế được cơ sở dữ liệu ở dạng chuẩn 3NF', 'Viết được truy vấn SQL nhiều bảng'],
  },
  {
    code: 'JPD113', name: 'Elementary Japanese 1-A1.1', nameVi: 'Tiếng Nhật sơ cấp 1-A1.1',
    credits: 3, termNo: 3,
    description: 'Bảng chữ Hiragana, Katakana, chữ Hán cơ bản và các mẫu câu giao tiếp sơ cấp.',
    topics: ['Hiragana và Katakana', 'Chào hỏi, giới thiệu', 'Số đếm, thời gian', 'Mẫu câu cơ bản'],
  },
  {
    code: 'WED201c', name: 'Web Design', nameVi: 'Thiết kế web',
    credits: 3, termNo: 3,
    description: 'HTML, CSS, bố cục responsive, nguyên lý thiết kế giao diện và JavaScript cơ bản cho trang web.',
    topics: ['HTML ngữ nghĩa', 'CSS và box model', 'Flexbox và Grid', 'Responsive design', 'JavaScript cơ bản', 'Khả năng truy cập'],
  },

  /* ─────────────────────────────── Kỳ 4 ─────────────────────────────── */
  {
    code: 'PRJ301', name: 'Java Web Application Development', nameVi: 'Phát triển ứng dụng web với Java',
    credits: 3, termNo: 4,
    description: 'Servlet, JSP, mô hình MVC, phiên làm việc, kết nối cơ sở dữ liệu bằng JDBC và triển khai ứng dụng web Java.',
    topics: ['Servlet và vòng đời', 'JSP và JSTL', 'Mô hình MVC', 'Session và cookie', 'JDBC và DAO', 'Filter và phân quyền'],
    requirements: [atLeast4('PRO192'), atLeast4('DBI202')],
  },
  {
    code: 'IOT102', name: 'Internet of Things', nameVi: 'Internet vạn vật',
    credits: 3, termNo: 4,
    description: 'Cảm biến, vi điều khiển, giao thức truyền thông và xây dựng hệ thống IoT nhỏ với Arduino.',
    topics: ['Kiến trúc hệ thống IoT', 'Cảm biến và cơ cấu chấp hành', 'Arduino', 'Giao thức MQTT và HTTP'],
  },
  {
    code: 'MAS291', name: 'Statistics and Probability', nameVi: 'Xác suất thống kê',
    credits: 3, termNo: 4,
    description: 'Xác suất, biến ngẫu nhiên, phân phối, ước lượng, kiểm định giả thuyết và hồi quy tuyến tính.',
    topics: ['Xác suất cơ bản', 'Biến ngẫu nhiên', 'Các phân phối thường gặp', 'Ước lượng', 'Kiểm định giả thuyết', 'Hồi quy tuyến tính'],
    requirements: [atLeast4('MAE101')],
  },
  {
    // The source table lists the two Japanese courses against each other in
    // both directions; the natural order (A1.1 before A1.2) is used here.
    code: 'JPD123', name: 'Elementary Japanese 1-A1.2', nameVi: 'Tiếng Nhật sơ cấp 1-A1.2',
    credits: 3, termNo: 4,
    description: 'Tiếp nối JPD113: thêm chữ Hán, động từ, tính từ và hội thoại theo tình huống hằng ngày.',
    topics: ['Động từ thể ます', 'Tính từ', 'Trợ từ', 'Hội thoại theo tình huống'],
    requirements: [atLeast4('JPD113')],
  },
  {
    code: 'SWE201c', name: 'Introduction to Software Engineering', nameVi: 'Nhập môn kỹ thuật phần mềm',
    credits: 3, termNo: 4,
    description: 'Quy trình phát triển phần mềm, Agile và Scrum, yêu cầu, thiết kế, kiểm thử và bảo trì ở mức tổng quan.',
    topics: ['Vòng đời phần mềm', 'Agile và Scrum', 'Yêu cầu phần mềm', 'Thiết kế phần mềm', 'Kiểm thử', 'Bảo trì'],
    requirements: [atLeast4('PRO192')],
  },

  /* ─────────────────────────────── Kỳ 5 ─────────────────────────────── */
  {
    code: 'SWP391', name: 'Software Development Project', nameVi: 'Dự án phát triển phần mềm',
    credits: 3, termNo: 5,
    description: 'Đồ án theo nhóm: đi trọn một vòng phát triển phần mềm từ yêu cầu, thiết kế, lập trình đến kiểm thử và bàn giao.',
    topics: ['Lập kế hoạch dự án', 'Đặc tả yêu cầu', 'Thiết kế hệ thống', 'Lập trình theo sprint', 'Kiểm thử và bàn giao'],
    assessment: 'Đánh giá theo từng iteration và buổi bảo vệ cuối kỳ',
    requirements: [atLeast4('PRJ301'), atLeast4('SWE201c'), pass('LAB211')],
  },
  {
    code: 'SWR302', name: 'Software Requirements', nameVi: 'Yêu cầu phần mềm',
    credits: 3, termNo: 5,
    description: 'Thu thập, phân tích, đặc tả và quản lý yêu cầu; viết tài liệu SRS và use case.',
    topics: ['Thu thập yêu cầu', 'Phân tích yêu cầu', 'Use case và user story', 'Đặc tả SRS', 'Quản lý thay đổi yêu cầu'],
    requirements: [atLeast4('SWE201c')],
  },
  {
    code: 'SWT301', name: 'Software Testing', nameVi: 'Kiểm thử phần mềm',
    credits: 3, termNo: 5,
    description: 'Các mức và loại kiểm thử, kỹ thuật thiết kế test case hộp đen, hộp trắng và quản lý lỗi.',
    topics: ['Nguyên lý kiểm thử', 'Các mức kiểm thử', 'Phân vùng tương đương và giá trị biên', 'Kiểm thử hộp trắng', 'Quản lý lỗi', 'Kiểm thử tự động'],
    requirements: [atLeast4('SWE201c')],
  },
  {
    code: 'FER202', name: 'Front-End Web Development with React', nameVi: 'Phát triển front-end với React',
    credits: 3, termNo: 5,
    description: 'JavaScript hiện đại, React, component, state, hooks, routing và gọi API.',
    topics: ['ES6+', 'Component và props', 'State và hooks', 'React Router', 'Gọi API', 'Quản lý state'],
    requirements: [atLeast4('WED201c')],
  },
  {
    code: 'WDU203c', name: 'UI/UX Design', nameVi: 'Thiết kế UI/UX',
    credits: 3, termNo: 5,
    description: 'Nghiên cứu người dùng, kiến trúc thông tin, wireframe, prototype và đánh giá khả năng sử dụng.',
    topics: ['Nghiên cứu người dùng', 'Kiến trúc thông tin', 'Wireframe', 'Prototype', 'Kiểm thử khả năng sử dụng'],
  },

  /* ─────────────────────────────── Kỳ 6 ─────────────────────────────── */
  {
    code: 'ENW493c', name: 'Research Methods and Academic Writing Skills', nameVi: 'Phương pháp nghiên cứu và viết học thuật',
    credits: 3, termNo: 6,
    description: 'Phương pháp nghiên cứu, tìm và đánh giá tài liệu, viết bài học thuật bằng tiếng Anh và trích dẫn.',
    topics: ['Đặt câu hỏi nghiên cứu', 'Tìm và đánh giá tài liệu', 'Viết học thuật', 'Trích dẫn và đạo văn'],
  },
  {
    code: 'OJT202', name: 'On-the-Job Training', nameVi: 'Thực tập tại doanh nghiệp',
    credits: 10, termNo: 6,
    description: 'Một kỳ làm việc thực tế tại doanh nghiệp, được hướng dẫn và đánh giá bởi cả doanh nghiệp và nhà trường.',
    topics: ['Làm việc trong dự án thực tế', 'Báo cáo tuần', 'Đánh giá của doanh nghiệp', 'Báo cáo thực tập'],
    // The source writes "(>6 tín chỉ)"; read as the owed subjects totalling at most 6 credits.
    requirements: [
      pass('SWP391'),
      { kind: 'maxDebt', terms: [1, 2, 3, 4, 5], maxSubjects: 2, maxCredits: 6, label: 'Các môn kỳ 1–5 nợ tối đa 2 môn (không quá 6 tín chỉ)' },
    ],
  },

  /* ─────────────────────────────── Kỳ 7 ─────────────────────────────── */
  {
    // The source writes "PRO192, SWE102"; SWE102 is read as SWE201c.
    code: 'SWD392', name: 'Software Architecture and Design', nameVi: 'Kiến trúc và thiết kế phần mềm',
    credits: 3, termNo: 7,
    description: 'Kiến trúc phần mềm, mẫu thiết kế, UML nâng cao và đánh giá thiết kế cho hệ thống lớn.',
    topics: ['Kiến trúc phân tầng và microservice', 'Mẫu thiết kế', 'Sơ đồ lớp và tuần tự', 'Thiết kế hướng miền', 'Đánh giá kiến trúc'],
    requirements: [atLeast4('PRO192'), atLeast4('SWE201c')],
  },
  {
    code: 'MMA301', name: 'Multiplatform Mobile App Development', nameVi: 'Phát triển ứng dụng di động đa nền tảng',
    credits: 3, termNo: 7,
    description: 'Xây dựng ứng dụng di động đa nền tảng với React Native: giao diện, điều hướng, lưu trữ và gọi API.',
    topics: ['React Native', 'Điều hướng', 'Lưu trữ cục bộ', 'Gọi API', 'Đóng gói ứng dụng'],
    requirements: [atLeast4('FER202')],
  },
  {
    code: 'SDN302', name: 'Server-Side Development with NodeJS, Express and MongoDB', nameVi: 'Phát triển phía máy chủ với NodeJS',
    credits: 3, termNo: 7,
    description: 'Xây dựng REST API với Node.js và Express, lưu trữ trên MongoDB, xác thực và phân quyền.',
    topics: ['Node.js và Express', 'REST API', 'MongoDB và Mongoose', 'Xác thực JWT', 'Phân quyền'],
    requirements: [atLeast4('DBI202'), atLeast4('FER202')],
  },
  {
    code: 'EXE101', name: 'Experiential Entrepreneurship 1', nameVi: 'Trải nghiệm khởi nghiệp 1',
    credits: 3, termNo: 7,
    description: 'Tìm ý tưởng, nghiên cứu khách hàng và xây dựng mô hình kinh doanh cho một dự án khởi nghiệp.',
    topics: ['Tìm ý tưởng', 'Nghiên cứu khách hàng', 'Business Model Canvas', 'Thuyết trình ý tưởng'],
  },
  {
    code: 'PMG201c', name: 'Project Management', nameVi: 'Quản lý dự án',
    credits: 3, termNo: 7,
    description: 'Lập kế hoạch, ước lượng, quản lý phạm vi, tiến độ, chi phí và rủi ro của dự án phần mềm.',
    topics: ['Phạm vi và WBS', 'Ước lượng', 'Tiến độ', 'Chi phí', 'Rủi ro', 'Quản lý nhóm'],
  },

  /* ─────────────────────────────── Kỳ 8 ─────────────────────────────── */
  {
    code: 'WDP301', name: 'Web Development Project', nameVi: 'Dự án phát triển web',
    credits: 3, termNo: 8,
    description: 'Đồ án nhóm xây dựng một ứng dụng web hoàn chỉnh với front-end React và back-end Node.js.',
    topics: ['Phân tích yêu cầu', 'Thiết kế API', 'Front-end React', 'Back-end Node.js', 'Triển khai'],
    requirements: [atLeast4('FER202'), atLeast4('SDN302')],
  },
  {
    code: 'PRM393', name: 'Mobile Programming', nameVi: 'Lập trình di động',
    credits: 3, termNo: 8,
    description: 'Lập trình ứng dụng di động gốc: vòng đời ứng dụng, giao diện, lưu trữ, thông báo và dịch vụ.',
    topics: ['Vòng đời ứng dụng', 'Giao diện và layout', 'Lưu trữ dữ liệu', 'Thông báo', 'Gọi dịch vụ web'],
    requirements: [atLeast4('PRO192')],
  },
  {
    code: 'MLN111', name: 'Philosophy of Marxism–Leninism', nameVi: 'Triết học Mác – Lênin',
    credits: 3, termNo: 8,
    description: 'Chủ nghĩa duy vật biện chứng và chủ nghĩa duy vật lịch sử.',
    topics: ['Chủ nghĩa duy vật biện chứng', 'Phép biện chứng duy vật', 'Lý luận nhận thức', 'Chủ nghĩa duy vật lịch sử'],
  },
  {
    code: 'EXE201', name: 'Experiential Entrepreneurship 2', nameVi: 'Trải nghiệm khởi nghiệp 2',
    credits: 3, termNo: 8,
    description: 'Hiện thực hoá ý tưởng từ EXE101 thành sản phẩm thật, thử nghiệm với khách hàng và đo kết quả.',
    topics: ['Xây dựng MVP', 'Thử nghiệm với khách hàng', 'Marketing', 'Đo lường và điều chỉnh'],
    requirements: [atLeast4('EXE101')],
  },
  {
    code: 'MLN122', name: 'Political Economics of Marxism–Leninism', nameVi: 'Kinh tế chính trị Mác – Lênin',
    credits: 2, termNo: 8,
    description: 'Hàng hoá, thị trường, giá trị thặng dư và kinh tế thị trường định hướng xã hội chủ nghĩa ở Việt Nam.',
    topics: ['Hàng hoá và thị trường', 'Giá trị thặng dư', 'Cạnh tranh và độc quyền', 'Kinh tế thị trường định hướng XHCN'],
  },
  {
    code: 'ITE302c', name: 'Ethics in IT', nameVi: 'Đạo đức trong công nghệ thông tin',
    credits: 3, termNo: 8,
    description: 'Đạo đức nghề nghiệp, quyền riêng tư, sở hữu trí tuệ và trách nhiệm xã hội của người làm công nghệ.',
    topics: ['Đạo đức nghề nghiệp', 'Quyền riêng tư', 'Sở hữu trí tuệ', 'Trách nhiệm xã hội'],
  },

  /* ─────────────────────────────── Kỳ 9 ─────────────────────────────── */
  {
    code: 'VNR202', name: 'History of Vietnam Communist Party', nameVi: 'Lịch sử Đảng Cộng sản Việt Nam',
    credits: 2, termNo: 9,
    description: 'Sự ra đời và quá trình lãnh đạo cách mạng của Đảng Cộng sản Việt Nam.',
    topics: ['Đảng ra đời', 'Lãnh đạo đấu tranh giành chính quyền', 'Kháng chiến và thống nhất', 'Đổi mới'],
    requirements: [atLeast4('MLN111'), atLeast4('MLN122')],
  },
  {
    code: 'HCM202', name: 'Ho Chi Minh Ideology', nameVi: 'Tư tưởng Hồ Chí Minh',
    credits: 2, termNo: 9,
    description: 'Nguồn gốc, nội dung và giá trị của tư tưởng Hồ Chí Minh.',
    topics: ['Cơ sở hình thành', 'Độc lập dân tộc và CNXH', 'Đảng và Nhà nước', 'Đạo đức và văn hoá'],
    requirements: [atLeast4('MLN111'), atLeast4('MLN122')],
  },
  {
    code: 'MLN131', name: 'Scientific Socialism', nameVi: 'Chủ nghĩa xã hội khoa học',
    credits: 2, termNo: 9,
    description: 'Sứ mệnh lịch sử của giai cấp công nhân và thời kỳ quá độ lên chủ nghĩa xã hội.',
    topics: ['Sứ mệnh của giai cấp công nhân', 'Thời kỳ quá độ', 'Dân chủ XHCN', 'Cơ cấu xã hội – giai cấp'],
    requirements: [atLeast4('MLN111'), atLeast4('MLN122')],
  },
];

/* The capstone: a thesis or the interdisciplinary project, one of the two. */
const CAPSTONE_CORE: Requirement[] = [
  pass('OJT202'),
  {
    kind: 'atLeast',
    count: 3,
    label: 'Đạt 3/4 môn điều kiện tiên quyết: SDN301m/SDN302, MMA301, WDP301, FER201m/FER202',
    of: [pass('SDN301m', 'SDN302'), pass('MMA301'), pass('WDP301'), pass('FER201m', 'FER202')],
  },
  {
    kind: 'avgScore',
    groups: [['PMG201c', 'PMG202c'], ['SWD391', 'SWD392'], ['SWP391']],
    min: 4,
    label: 'Điểm trung bình PMG201c/PMG202c, SWD391/SWD392, SWP391 ≥ 4.0',
  },
];

const CAPSTONE: CurriculumEntry[] = [
  {
    code: 'SE_GRA_ELE', name: 'Graduation Thesis (SE)', nameVi: 'Khoá luận tốt nghiệp',
    credits: 10, termNo: 9, choiceGroup: 'graduation',
    description: 'Đồ án tốt nghiệp ngành Kỹ thuật phần mềm, thực hiện theo nhóm và bảo vệ trước hội đồng.',
    topics: ['Đề xuất đề tài', 'Phân tích và thiết kế', 'Triển khai', 'Kiểm thử', 'Bảo vệ trước hội đồng'],
    requirements: CAPSTONE_CORE,
  },
  {
    code: 'EXE404', name: 'Interdisciplinary Capstone Project', nameVi: 'Đồ án liên ngành',
    credits: 10, termNo: 9, choiceGroup: 'graduation',
    description: 'Thay cho khoá luận: phát triển tiếp dự án khởi nghiệp từ EXE201 cùng sinh viên các ngành khác.',
    topics: ['Phát triển sản phẩm', 'Mô hình kinh doanh', 'Vận hành thử', 'Bảo vệ trước hội đồng'],
    requirements: [...CAPSTONE_CORE, pass('EXE201')],
  },
];

/** Terms 7, 8 and 9 need the internship passed. */
const AFTER_OJT = new Set([7, 8, 9]);

export const FPTU_SE: CurriculumEntry[] = [...BASE, ...CAPSTONE].map((entry) => {
  if (!AFTER_OJT.has(entry.termNo)) return entry;
  const requirements = entry.requirements ?? [];
  const alreadyThere = requirements.some((r) => r.kind === 'subject' && r.codes.includes('OJT202'));
  return { ...entry, requirements: alreadyThere ? requirements : [pass('OJT202'), ...requirements] };
});

/** Codes from the previous seed that the real curriculum renamed; documents follow the rename. */
export const FPTU_SE_RENAMES: Record<string, string> = {
  NWC203: 'NWC204',
  WED201: 'WED201c',
  SWE201: 'SWE201c',
  SAD302: 'SWD392',
};

export const FPTU_SE_PASS_MARK = 5;
