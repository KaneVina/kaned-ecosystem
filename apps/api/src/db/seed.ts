/**
 * Seeds a realistic slice of Vietnamese higher education: two universities,
 * a full Software Engineering curriculum with a working prerequisite graph,
 * and a set of documents to browse.
 *
 *   npm run db:seed -w @kaned/api
 */
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db, sqlClient } from './index.js';
import {
  documentTags,
  documents,
  faculties,
  grades,
  majorSubjects,
  majors,
  reviews,
  subjectPrerequisites,
  subjects,
  tags,
  universities,
  users,
} from './schema.js';

type Semester = 'S1' | 'S2' | 'SUMMER';
type PrereqType = 'PREREQUISITE' | 'COREQUISITE' | 'PRIOR';

const UNIVERSITIES = [
  {
    code: 'FPTU',
    name: 'FPT University',
    nameVi: 'Trường Đại học FPT',
    city: 'Hà Nội',
    region: 'north',
    kind: 'Private',
    foundedYear: 2006,
    color: '#D9661F',
    description:
      'Technology-focused private university with block-based terms and a large community sharing lab work and exam preparation.',
  },
  {
    code: 'HCMUT',
    name: 'Ho Chi Minh City University of Technology',
    nameVi: 'Trường Đại học Bách khoa – ĐHQG-HCM',
    city: 'TP. Hồ Chí Minh',
    region: 'south',
    kind: 'Public',
    foundedYear: 1957,
    color: '#22408C',
    description:
      'One of Vietnam’s leading engineering universities, with deep archives of past examination papers.',
  },
  {
    code: 'UIT',
    name: 'University of Information Technology, VNU-HCM',
    nameVi: 'Trường Đại học Công nghệ Thông tin – ĐHQG-HCM',
    city: 'TP. Hồ Chí Minh',
    region: 'south',
    kind: 'Public',
    foundedYear: 2006,
    color: '#3F51C2',
    description: 'Specialist IT university with strong networking and security programmes.',
  },
  {
    code: 'UEH',
    name: 'University of Economics Ho Chi Minh City',
    nameVi: 'Trường Đại học Kinh tế TP.HCM',
    city: 'TP. Hồ Chí Minh',
    region: 'south',
    kind: 'Public',
    foundedYear: 1976,
    color: '#0E7A6D',
    description: 'Leading economics and business school.',
  },
];

interface SeedSubject {
  code: string;
  name: string;
  nameVi: string;
  credits: number;
  termNo: number;
  typicalYear: number;
  typicalSemester: Semester;
  description: string;
  topics: string[];
  outcomes?: string[];
  assessment?: string;
  requires?: Array<[string, PrereqType]>;
}

/** FPT University — Software Engineering, terms 1 to 9. */
const SE_CURRICULUM: SeedSubject[] = [
  {
    code: 'PRF192', name: 'Programming Fundamentals', nameVi: 'Nhập môn lập trình',
    credits: 3, termNo: 1, typicalYear: 1, typicalSemester: 'S1',
    description: 'First programming course, taught in C: variables, control flow, functions, arrays, pointers and files.',
    topics: ['Biến, kiểu dữ liệu và toán tử', 'Cấu trúc điều khiển', 'Hàm và truyền tham số', 'Mảng và chuỗi ký tự', 'Con trỏ và cấp phát động', 'Cấu trúc và tập tin'],
    outcomes: ['Đọc hiểu và viết được chương trình C cơ bản', 'Sử dụng mảng, con trỏ và cấu trúc để giải bài toán nhỏ'],
    assessment: 'Lab 20% · Progress test 20% · Practical exam 30% · Final exam 30%',
  },
  {
    code: 'MAE101', name: 'Mathematics for Engineering', nameVi: 'Toán cho ngành kỹ thuật',
    credits: 3, termNo: 1, typicalYear: 1, typicalSemester: 'S1',
    description: 'Calculus and linear algebra for computing: limits, derivatives, integrals and matrices.',
    topics: ['Giới hạn và liên tục', 'Đạo hàm và ứng dụng', 'Tích phân', 'Ma trận và định thức', 'Hệ phương trình tuyến tính'],
  },
  {
    code: 'SSL101c', name: 'Academic Skills for University Success', nameVi: 'Kỹ năng học tập đại học',
    credits: 3, termNo: 1, typicalYear: 1, typicalSemester: 'S1',
    description: 'Study skills, teamwork, presentation and academic integrity.',
    topics: ['Quản lý thời gian', 'Làm việc nhóm', 'Thuyết trình', 'Liêm chính học thuật'],
  },
  {
    code: 'PRO192', name: 'Object-Oriented Programming', nameVi: 'Lập trình hướng đối tượng',
    credits: 3, termNo: 2, typicalYear: 1, typicalSemester: 'S2',
    description: 'Object-oriented design in Java: encapsulation, inheritance, polymorphism, interfaces, exceptions and collections.',
    topics: ['Lớp và đối tượng trong Java', 'Đóng gói và phạm vi truy cập', 'Kế thừa', 'Đa hình và lớp trừu tượng', 'Interface', 'Xử lý ngoại lệ', 'Collections Framework'],
    outcomes: ['Thiết kế được lớp và quan hệ giữa các lớp', 'Áp dụng đa hình để viết mã mở rộng được'],
    assessment: 'Assignment 30% · Practical exam 30% · Final exam 40%',
    requires: [['PRF192', 'PREREQUISITE']],
  },
  {
    code: 'MAD101', name: 'Discrete Mathematics', nameVi: 'Toán rời rạc',
    credits: 3, termNo: 2, typicalYear: 1, typicalSemester: 'S2',
    description: 'Logic, sets, proofs, relations, combinatorics, Boolean algebra and an introduction to graphs.',
    topics: ['Logic mệnh đề', 'Vị từ và lượng từ', 'Tập hợp và ánh xạ', 'Quy nạp toán học', 'Quan hệ', 'Tổ hợp', 'Đại số Boole', 'Lý thuyết đồ thị cơ bản'],
    requires: [['MAE101', 'PRIOR']],
  },
  {
    code: 'OSG202', name: 'Operating Systems', nameVi: 'Hệ điều hành',
    credits: 3, termNo: 3, typicalYear: 2, typicalSemester: 'S1',
    description: 'Processes and threads, CPU scheduling, synchronisation, deadlock, memory management and file systems.',
    topics: ['Tiến trình và luồng', 'Lập lịch CPU', 'Đồng bộ hóa và semaphore', 'Deadlock', 'Quản lý bộ nhớ và phân trang', 'Bộ nhớ ảo', 'Hệ thống tập tin'],
    requires: [['PRF192', 'PREREQUISITE']],
  },
  {
    code: 'CSD201', name: 'Data Structures and Algorithms', nameVi: 'Cấu trúc dữ liệu và giải thuật',
    credits: 3, termNo: 3, typicalYear: 2, typicalSemester: 'S1',
    description: 'How data is organised in memory and how to reason about algorithm cost: lists, trees, hashing, graphs and sorting.',
    topics: ['Độ phức tạp thuật toán và ký hiệu Big-O', 'Mảng và danh sách liên kết', 'Ngăn xếp và hàng đợi', 'Đệ quy và quay lui', 'Cây nhị phân tìm kiếm (BST)', 'Cây AVL và các phép xoay', 'Bảng băm', 'Đồ thị: BFS, DFS, Dijkstra', 'Các thuật toán sắp xếp'],
    outcomes: ['Phân tích được độ phức tạp của thuật toán', 'Chọn đúng cấu trúc dữ liệu cho bài toán', 'Cài đặt được cây cân bằng và các thuật toán đồ thị cơ bản'],
    assessment: 'Assignment 20% · Progress test 20% · Practical exam 20% · Final exam 40%',
    requires: [['PRO192', 'PREREQUISITE'], ['MAD101', 'PREREQUISITE']],
  },
  {
    code: 'DBI202', name: 'Database Systems', nameVi: 'Hệ quản trị cơ sở dữ liệu',
    credits: 3, termNo: 3, typicalYear: 2, typicalSemester: 'S1',
    description: 'Designing a relational database from requirements to a working schema: ER modelling, normalisation, SQL, indexing and transactions.',
    topics: ['Mô hình thực thể – liên kết (ERD)', 'Mô hình quan hệ và đại số quan hệ', 'SQL: truy vấn cơ bản', 'JOIN, GROUP BY và truy vấn lồng', 'Phụ thuộc hàm và chuẩn hóa', 'Chỉ mục và tối ưu truy vấn', 'Giao tác và điều khiển đồng thời'],
    outcomes: ['Thiết kế được lược đồ ở dạng chuẩn 3NF', 'Viết được truy vấn SQL nhiều bảng'],
    assessment: 'Assignment 30% · Progress test 20% · Final exam 50%',
    requires: [['PRF192', 'PREREQUISITE']],
  },
  {
    code: 'WED201', name: 'Web Design', nameVi: 'Thiết kế web',
    credits: 3, termNo: 4, typicalYear: 2, typicalSemester: 'S2',
    description: 'Semantic HTML, modern CSS layout, responsive design and accessible interfaces.',
    topics: ['HTML5 ngữ nghĩa', 'CSS: Flexbox và Grid', 'Thiết kế responsive', 'Khả năng truy cập'],
  },
  {
    code: 'NWC203', name: 'Computer Networks', nameVi: 'Mạng máy tính',
    credits: 3, termNo: 4, typicalYear: 2, typicalSemester: 'S2',
    description: 'How data moves between machines: the OSI and TCP/IP models, addressing and subnetting, routing and transport protocols.',
    topics: ['Mô hình OSI và TCP/IP', 'Tầng liên kết dữ liệu', 'Địa chỉ IPv4 và chia subnet', 'Định tuyến tĩnh và động', 'TCP, UDP và kiểm soát tắc nghẽn', 'DNS, HTTP và DHCP', 'VLAN và chuyển mạch'],
    outcomes: ['Chia được subnet theo yêu cầu', 'Giải thích được quá trình bắt tay ba bước của TCP'],
    requires: [['OSG202', 'PRIOR']],
  },
  {
    code: 'SWE201', name: 'Introduction to Software Engineering', nameVi: 'Nhập môn kỹ thuật phần mềm',
    credits: 3, termNo: 4, typicalYear: 2, typicalSemester: 'S2',
    description: 'How software gets built by teams: process models, requirements, design, version control and estimation.',
    topics: ['Quy trình phát triển phần mềm', 'Mô hình thác nước, Agile và Scrum', 'Thu thập và đặc tả yêu cầu', 'Use Case và User Story', 'Thiết kế kiến trúc phần mềm', 'Quản lý cấu hình với Git', 'Ước lượng và quản lý dự án'],
    requires: [['PRO192', 'PRIOR']],
  },
  {
    code: 'PRJ301', name: 'Java Web Application Development', nameVi: 'Lập trình Java web',
    credits: 3, termNo: 5, typicalYear: 3, typicalSemester: 'S1',
    description: 'Servlets, JSP, the MVC pattern, JDBC and session management.',
    topics: ['Servlet và JSP', 'Mô hình MVC', 'JDBC và DAO', 'Session và Cookie', 'Bảo mật ứng dụng web'],
    requires: [['PRO192', 'PREREQUISITE'], ['DBI202', 'PREREQUISITE'], ['WED201', 'PRIOR']],
  },
  {
    code: 'SWR302', name: 'Software Requirement', nameVi: 'Đặc tả yêu cầu phần mềm',
    credits: 3, termNo: 5, typicalYear: 3, typicalSemester: 'S1',
    description: 'Eliciting, specifying and validating requirements; writing an SRS to IEEE 830.',
    topics: ['Kỹ thuật thu thập yêu cầu', 'Phân loại yêu cầu', 'Tài liệu SRS', 'Kiểm tra và xác nhận yêu cầu'],
    requires: [['SWE201', 'PREREQUISITE']],
  },
  {
    code: 'SWT301', name: 'Software Testing', nameVi: 'Kiểm thử phần mềm',
    credits: 3, termNo: 6, typicalYear: 3, typicalSemester: 'S2',
    description: 'Testing principles and techniques: test levels, black-box and white-box design, test plans and automation.',
    topics: ['Nguyên lý kiểm thử phần mềm', 'Các mức kiểm thử', 'Kỹ thuật hộp đen', 'Kỹ thuật hộp trắng', 'Test case và test plan', 'Kiểm thử đơn vị với JUnit', 'Kiểm thử tự động với Selenium'],
    outcomes: ['Thiết kế test case từ đặc tả', 'Viết được báo cáo lỗi rõ ràng'],
    requires: [['SWR302', 'PREREQUISITE']],
  },
  {
    code: 'SAD302', name: 'System Analysis and Design', nameVi: 'Phân tích và thiết kế hệ thống',
    credits: 3, termNo: 6, typicalYear: 3, typicalSemester: 'S2',
    description: 'Turning a business process into a specification with DFD and UML models.',
    topics: ['Khảo sát hiện trạng', 'Sơ đồ phân rã chức năng', 'Sơ đồ luồng dữ liệu (DFD)', 'Mô hình hóa với UML', 'Sơ đồ lớp và sơ đồ tuần tự', 'Thiết kế cơ sở dữ liệu'],
    requires: [['SWR302', 'PREREQUISITE'], ['DBI202', 'PREREQUISITE']],
  },
  {
    code: 'SWP391', name: 'Software Development Project', nameVi: 'Đồ án phát triển phần mềm',
    credits: 4, termNo: 6, typicalYear: 3, typicalSemester: 'S2',
    description: 'A team project that runs a full iteration: requirements, design, build, test and demo.',
    topics: ['Lập kế hoạch dự án', 'Phân chia công việc', 'Quản lý mã nguồn', 'Báo cáo và bảo vệ'],
    requires: [['PRJ301', 'PREREQUISITE'], ['SWR302', 'PREREQUISITE'], ['SWT301', 'COREQUISITE']],
  },
  {
    code: 'OJT202', name: 'On-the-Job Training', nameVi: 'Thực tập tại doanh nghiệp',
    credits: 10, termNo: 7, typicalYear: 4, typicalSemester: 'S1',
    description: 'One term working inside a software company, with a report and a supervisor review.',
    topics: ['Quy trình làm việc thực tế', 'Báo cáo thực tập', 'Đánh giá của doanh nghiệp'],
    requires: [['SWP391', 'PREREQUISITE']],
  },
  {
    code: 'MLN111', name: 'Philosophy of Marxism and Leninism', nameVi: 'Triết học Mác – Lênin',
    credits: 3, termNo: 8, typicalYear: 4, typicalSemester: 'S2',
    description: 'Compulsory political theory module.',
    topics: ['Chủ nghĩa duy vật biện chứng', 'Chủ nghĩa duy vật lịch sử'],
  },
  {
    code: 'SEP490', name: 'Capstone Project', nameVi: 'Đồ án tốt nghiệp',
    credits: 10, termNo: 9, typicalYear: 4, typicalSemester: 'S2',
    description: 'The graduation project: a complete product built and defended by a team.',
    topics: ['Đề xuất đề tài', 'Thiết kế hệ thống', 'Triển khai', 'Bảo vệ trước hội đồng'],
    requires: [['OJT202', 'PREREQUISITE'], ['SAD302', 'PREREQUISITE']],
  },
];

/** HCMUT — Computer Science, a smaller slice for cross-university browsing. */
const CS_CURRICULUM: SeedSubject[] = [
  {
    code: 'CO1003', name: 'Introduction to Computing', nameVi: 'Nhập môn điện toán',
    credits: 3, termNo: 1, typicalYear: 1, typicalSemester: 'S1',
    description: 'First programming course in C for engineering students.',
    topics: ['Thuật toán và lưu đồ', 'Ngôn ngữ C', 'Hàm và mảng'],
  },
  {
    code: 'CO2003', name: 'Data Structures and Algorithms', nameVi: 'Cấu trúc dữ liệu và giải thuật',
    credits: 4, termNo: 3, typicalYear: 2, typicalSemester: 'S1',
    description: 'Lists, trees, graphs, hashing and algorithm analysis, taught in C++.',
    topics: ['Phân tích độ phức tạp', 'Danh sách liên kết', 'Cây tìm kiếm', 'Bảng băm', 'Đồ thị'],
    requires: [['CO1003', 'PREREQUISITE']],
  },
  {
    code: 'CO2013', name: 'Database Systems', nameVi: 'Hệ cơ sở dữ liệu',
    credits: 3, termNo: 4, typicalYear: 2, typicalSemester: 'S2',
    description: 'Relational model, SQL, normalisation and transaction processing.',
    topics: ['Mô hình quan hệ', 'SQL nâng cao', 'Chuẩn hóa', 'Giao tác'],
    requires: [['CO1003', 'PREREQUISITE']],
  },
  {
    code: 'CO3001', name: 'Software Engineering', nameVi: 'Công nghệ phần mềm',
    credits: 3, termNo: 5, typicalYear: 3, typicalSemester: 'S1',
    description: 'Software processes, requirements, architecture and quality.',
    topics: ['Quy trình phần mềm', 'Phân tích yêu cầu', 'Kiến trúc phần mềm', 'Đảm bảo chất lượng'],
    requires: [['CO2003', 'PREREQUISITE']],
  },
];

const DOCUMENTS = [
  { subject: 'CSD201', title: 'Đề thi cuối kỳ Cấu trúc dữ liệu và giải thuật – HK1 2025–2026 (có đáp án)', description: 'Đề thi cuối kỳ chính thức gồm 4 câu tự luận, thời gian 90 phút. Lời giải do mình tự làm và đã đối chiếu với đáp án của bạn cùng lớp, có ghi chú các lỗi thường gặp khi chấm.', type: 'EXAM', format: 'PDF', year: 2, semester: 'S1', tags: ['đề thi', 'cuối kỳ', 'có đáp án', 'BST'], downloads: 5120, views: 18904, pages: 8, fileBytes: 1258291 },
  { subject: 'CSD201', title: 'Slide bài giảng CSD201 – Chương 5: Cây nhị phân tìm kiếm và cây AVL', description: 'Bộ slide chương 5 do giảng viên cung cấp, bổ sung thêm phần minh họa từng bước cho 4 trường hợp xoay cây AVL (LL, RR, LR, RL) và 12 bài tập tự luyện ở cuối.', type: 'SLIDES', format: 'PPTX', year: 2, semester: 'S1', tags: ['AVL', 'BST', 'slide'], downloads: 3412, views: 12840, pages: 46, fileBytes: 8808038 },
  { subject: 'CSD201', title: 'Cheat sheet thuật toán sắp xếp và độ phức tạp Big-O', description: 'Bảng tóm tắt 4 trang: độ phức tạp các thuật toán sắp xếp, cấu trúc dữ liệu thông dụng và mẹo nhận dạng dạng bài. In ra mang vào phòng ôn rất tiện.', type: 'REVIEW', format: 'PDF', year: 2, semester: 'S1', tags: ['Big-O', 'sắp xếp', 'cheat sheet'], downloads: 2140, views: 7020, pages: 4, fileBytes: 524288 },
  { subject: 'DBI202', title: 'Tổng hợp 120 câu trắc nghiệm SQL ôn thi DBI202', description: '120 câu trắc nghiệm chia theo 6 chủ đề: truy vấn cơ bản, JOIN, GROUP BY, truy vấn lồng, chuẩn hóa và giao tác. Có đáp án và giải thích ngắn cho từng câu.', type: 'REVIEW', format: 'PDF', year: 2, semester: 'S2', tags: ['SQL', 'trắc nghiệm', 'ôn thi'], downloads: 4280, views: 15120, pages: 34, fileBytes: 2202009 },
  { subject: 'DBI202', title: 'Bài tập lớn CSDL: Thiết kế cơ sở dữ liệu quản lý bán hàng (ERD + script SQL)', description: 'Bài tập lớn gồm ERD, lược đồ quan hệ ở dạng 3NF, script tạo bảng, dữ liệu mẫu và 20 câu truy vấn có kết quả chạy thử.', type: 'ASSIGNMENT', format: 'DOCX', year: 2, semester: 'S1', tags: ['ERD', 'SQL', 'bài tập lớn'], downloads: 1712, views: 6280, pages: 22, fileBytes: 1992294 },
  { subject: 'NWC203', title: 'Slide Mạng máy tính – Chương 4: Địa chỉ IPv4 và chia subnet', description: 'Slide chương 4 có thêm 15 bài tập chia subnet và VLSM từ dễ đến khó, kèm bảng tra nhanh subnet mask. Phần cuối có mẹo tính nhẩm số host.', type: 'SLIDES', format: 'PPTX', year: 2, semester: 'S2', tags: ['subnet', 'IPv4', 'VLSM'], downloads: 2655, views: 9910, pages: 52, fileBytes: 5872025 },
  { subject: 'NWC203', title: 'Bộ đề thi giữa kỳ Mạng máy tính 2022–2025 kèm lời giải chi tiết', description: 'Tổng hợp 6 đề giữa kỳ của 4 năm gần nhất. Mỗi đề đều có lời giải chi tiết, đặc biệt phần chia subnet và tính toán thời gian truyền.', type: 'EXAM', format: 'PDF', year: 2, semester: 'S2', tags: ['đề thi', 'giữa kỳ', 'có lời giải'], downloads: 3984, views: 14230, pages: 26, fileBytes: 2831155 },
  { subject: 'PRO192', title: 'Đề thi thực hành PRO192 – Practical Exam (có code mẫu)', description: 'Đề thi thực hành 3 câu (OOP, Collections, xử lý file) cùng mã nguồn mẫu đạt điểm tối đa. Có ghi chú cách test nhanh trước khi nộp.', type: 'EXAM', format: 'PDF', year: 1, semester: 'S2', tags: ['PRO192', 'Java', 'practical exam'], downloads: 3630, views: 13280, pages: 7, fileBytes: 943718 },
  { subject: 'PRO192', title: 'Bài tập thực hành Lập trình hướng đối tượng Java – Lab 1 đến Lab 8', description: 'Đề bài 8 bài lab môn PRO192 kèm hướng dẫn giải và mã nguồn mẫu. Phù hợp để luyện trước kỳ thi thực hành.', type: 'EXERCISES', format: 'PDF', year: 1, semester: 'S2', tags: ['Java', 'lab', 'OOP'], downloads: 2210, views: 8840, pages: 40, fileBytes: 3250585 },
  { subject: 'MAD101', title: 'Tóm tắt lý thuyết Toán rời rạc – Logic, tập hợp và quy nạp', description: 'Tóm tắt lý thuyết 4 chương đầu, mỗi định nghĩa đều có ví dụ và phản ví dụ. Cuối mỗi phần có 10 bài tập chọn lọc từ đề thi các năm.', type: 'NOTES', format: 'PDF', year: 1, semester: 'S2', tags: ['toán rời rạc', 'logic', 'quy nạp'], downloads: 2342, views: 8710, pages: 30, fileBytes: 1887436 },
  { subject: 'SWT301', title: 'Đề cương ôn tập Kiểm thử phần mềm SWT301 – Cuối kỳ', description: 'Đề cương tóm tắt 8 chương theo slide của trường, có câu hỏi ôn tập cuối mỗi chương và phần tổng hợp các kỹ thuật thiết kế test case hay ra thi.', type: 'REVIEW', format: 'DOCX', year: 3, semester: 'S2', tags: ['SWT301', 'đề cương', 'ôn thi'], downloads: 1520, views: 5480, pages: 18, fileBytes: 943718 },
  { subject: 'SWT301', title: 'Bộ test case mẫu (Excel) – Kiểm thử chức năng giỏ hàng và thanh toán', description: 'File Excel gồm 64 test case cho chức năng giỏ hàng và thanh toán, chia theo mức độ ưu tiên. Có sẵn sheet test plan, bug report và thống kê kết quả.', type: 'EXERCISES', format: 'XLSX', year: 3, semester: 'S2', tags: ['test case', 'Excel', 'mẫu'], downloads: 1188, views: 4650, pages: 12, fileBytes: 629145 },
  { subject: 'SAD302', title: 'Sơ đồ UML hoàn chỉnh cho hệ thống quản lý khách sạn', description: 'Bộ sơ đồ UML đầy đủ: Use Case, Activity, Class, Sequence và State cho hệ thống quản lý khách sạn. Vẽ bằng StarUML, có file gốc trong phụ lục.', type: 'ASSIGNMENT', format: 'PDF', year: 3, semester: 'S2', tags: ['UML', 'use case', 'sơ đồ lớp'], downloads: 1456, views: 5870, pages: 20, fileBytes: 4089446 },
  { subject: 'SWR302', title: 'Đặc tả yêu cầu phần mềm (SRS) – Ứng dụng đặt lịch khám bệnh', description: 'Tài liệu SRS theo chuẩn IEEE 830 cho ứng dụng đặt lịch khám bệnh, gồm yêu cầu chức năng, phi chức năng, sơ đồ Use Case và đặc tả chi tiết 14 use case.', type: 'REPORT', format: 'DOCX', year: 3, semester: 'S1', tags: ['SRS', 'IEEE 830', 'use case'], downloads: 1076, views: 4980, pages: 48, fileBytes: 3774873 },
  { subject: 'SWE201', title: 'Slide Nhập môn Kỹ thuật phần mềm – Agile và Scrum', description: 'Slide về tuyên ngôn Agile, vai trò và sự kiện trong Scrum, kèm ví dụ Product Backlog thực tế của một nhóm đồ án.', type: 'SLIDES', format: 'PPTX', year: 2, semester: 'S2', tags: ['Agile', 'Scrum'], downloads: 1688, views: 6420, pages: 41, fileBytes: 6606028 },
  { subject: 'OSG202', title: 'Bài tập Deadlock và thuật toán Banker có lời giải', description: '20 bài tập về deadlock, đồ thị cấp phát tài nguyên và thuật toán Banker. Lời giải trình bày dạng bảng để dễ theo dõi từng bước.', type: 'EXERCISES', format: 'PDF', year: 2, semester: 'S1', tags: ['deadlock', 'Banker', 'có lời giải'], downloads: 1610, views: 6130, pages: 16, fileBytes: 1153433 },
  { subject: 'PRJ301', title: 'Hướng dẫn xây dựng ứng dụng Java Web theo mô hình MVC', description: 'Hướng dẫn từng bước dựng project Servlet + JSP theo MVC, kết nối SQL Server bằng JDBC, có mã nguồn mẫu cho chức năng đăng nhập và phân trang.', type: 'NOTES', format: 'PDF', year: 3, semester: 'S1', tags: ['Java web', 'MVC', 'JDBC'], downloads: 1935, views: 7120, pages: 36, fileBytes: 4404019 },
  { subject: 'CO2003', title: 'Đề thi cuối kỳ Cấu trúc dữ liệu và giải thuật CO2003 – HK1 2024–2025', description: 'Đề thi cuối kỳ của Bách khoa, 4 câu tự luận về cây AVL, bảng băm và đồ thị. Kèm lời giải tham khảo do sinh viên trong lớp tổng hợp.', type: 'EXAM', format: 'PDF', year: 2, semester: 'S1', tags: ['đề thi', 'CO2003', 'Bách khoa'], downloads: 2890, views: 10420, pages: 6, fileBytes: 838860 },
  { subject: 'CO2013', title: 'Bài tập Đại số quan hệ và SQL có lời giải chi tiết', description: '40 bài tập chuyển đổi giữa câu hỏi tiếng Việt, đại số quan hệ và SQL trên cơ sở dữ liệu quản lý đề án. Lời giải trình bày song song hai cách.', type: 'EXERCISES', format: 'PDF', year: 2, semester: 'S2', tags: ['đại số quan hệ', 'SQL', 'có lời giải'], downloads: 1820, views: 6590, pages: 24, fileBytes: 1468006 },
  { subject: 'CO3001', title: 'Tổng hợp câu hỏi lý thuyết Công nghệ phần mềm CO3001', description: 'Ngân hàng câu hỏi lý thuyết theo từng chương, có đáp án ngắn gọn. Dùng để ôn nhanh trong tuần thi.', type: 'REVIEW', format: 'DOCX', year: 3, semester: 'S1', tags: ['ôn tập', 'lý thuyết'], downloads: 1240, views: 4870, pages: 28, fileBytes: 1258291 },
];

const PEOPLE = [
  { email: 'ngoc.tb@fpt.edu.vn', name: 'Trần Bảo Ngọc', year: 3 },
  { email: 'minhanh.nguyen@fpt.edu.vn', name: 'Nguyễn Minh Anh', year: 4 },
  { email: 'giahuy.tran@hcmut.edu.vn', name: 'Trần Gia Huy', year: 3 },
  { email: 'thaovy.le@ctu.edu.vn', name: 'Lê Thảo Vy', year: 3 },
  { email: 'quocbao.pham@uit.edu.vn', name: 'Phạm Quốc Bảo', year: 4 },
];

/** A real, publicly hosted sample PDF so the viewer has something to show. */
const SAMPLE_FILE = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

const slugify = (input: string) =>
  input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

async function seedCurriculum(
  universityId: string,
  faculty: { code: string; name: string; nameVi: string },
  major: { code: string; name: string; nameVi: string; totalCredits: number },
  list: SeedSubject[],
) {
  const [facultyRow] = await db
    .insert(faculties)
    .values({ ...faculty, universityId })
    .onConflictDoUpdate({
      target: [faculties.universityId, faculties.code],
      set: { name: faculty.name, nameVi: faculty.nameVi },
    })
    .returning({ id: faculties.id });

  const [majorRow] = await db
    .insert(majors)
    .values({ ...major, facultyId: facultyRow.id })
    .onConflictDoUpdate({
      target: [majors.facultyId, majors.code],
      set: { name: major.name, nameVi: major.nameVi, totalCredits: major.totalCredits },
    })
    .returning({ id: majors.id });

  const subjectIds: Record<string, string> = {};

  for (const s of list) {
    const [row] = await db
      .insert(subjects)
      .values({
        code: s.code,
        name: s.name,
        nameVi: s.nameVi,
        credits: s.credits,
        description: s.description,
        topics: s.topics,
        outcomes: s.outcomes ?? [],
        assessment: s.assessment ?? null,
        typicalYear: s.typicalYear,
        typicalSemester: s.typicalSemester,
        universityId,
        facultyId: facultyRow.id,
      })
      .onConflictDoUpdate({
        target: [subjects.universityId, subjects.code],
        set: {
          name: s.name,
          nameVi: s.nameVi,
          credits: s.credits,
          description: s.description,
          topics: s.topics,
          outcomes: s.outcomes ?? [],
          assessment: s.assessment ?? null,
          typicalYear: s.typicalYear,
          typicalSemester: s.typicalSemester,
          facultyId: facultyRow.id,
        },
      })
      .returning({ id: subjects.id });

    subjectIds[s.code] = row.id;

    await db
      .insert(majorSubjects)
      .values({ majorId: majorRow.id, subjectId: row.id, termNo: s.termNo, isRequired: true })
      .onConflictDoUpdate({
        target: [majorSubjects.majorId, majorSubjects.subjectId],
        set: { termNo: s.termNo },
      });
  }

  // Prerequisite edges, once every subject exists.
  for (const s of list) {
    for (const [requiredCode, type] of s.requires ?? []) {
      const subjectId = subjectIds[s.code];
      const requiresId = subjectIds[requiredCode];
      if (!subjectId || !requiresId) continue;
      await db
        .insert(subjectPrerequisites)
        .values({ subjectId, requiresId, type })
        .onConflictDoUpdate({
          target: [subjectPrerequisites.subjectId, subjectPrerequisites.requiresId],
          set: { type },
        });
    }
  }

  return { facultyId: facultyRow.id, majorId: majorRow.id, subjectIds };
}

async function main() {
  console.log('→ universities');
  const universityIds: Record<string, string> = {};
  for (const u of UNIVERSITIES) {
    const [row] = await db
      .insert(universities)
      .values(u)
      .onConflictDoUpdate({ target: universities.code, set: { name: u.name, nameVi: u.nameVi } })
      .returning({ id: universities.id });
    universityIds[u.code] = row.id;
  }

  console.log('→ FPTU Software Engineering curriculum');
  const se = await seedCurriculum(
    universityIds.FPTU,
    { code: 'IT', name: 'Information Technology', nameVi: 'Công nghệ Thông tin' },
    { code: 'SE', name: 'Software Engineering', nameVi: 'Kỹ thuật phần mềm', totalCredits: 145 },
    SE_CURRICULUM,
  );

  console.log('→ HCMUT Computer Science curriculum');
  const cs = await seedCurriculum(
    universityIds.HCMUT,
    { code: 'CSE', name: 'Computer Science and Engineering', nameVi: 'Khoa học và Kỹ thuật Máy tính' },
    { code: 'CS', name: 'Computer Science', nameVi: 'Khoa học máy tính', totalCredits: 142 },
    CS_CURRICULUM,
  );

  console.log('→ people');
  const passwordHash = await bcrypt.hash('kaned2026', 12);
  const userIds: string[] = [];
  for (const person of PEOPLE) {
    const [row] = await db
      .insert(users)
      .values({
        email: person.email,
        name: person.name,
        passwordHash,
        year: person.year,
        universityId: universityIds.FPTU,
        majorId: se.majorId,
      })
      .onConflictDoUpdate({ target: users.email, set: { name: person.name } })
      .returning({ id: users.id });
    userIds.push(row.id);
  }

  console.log('→ documents');
  const subjectIds = { ...se.subjectIds, ...cs.subjectIds };
  let index = 0;

  for (const doc of DOCUMENTS) {
    const subjectId = subjectIds[doc.subject];
    if (!subjectId) continue;

    const existing = await db.query.documents.findFirst({ where: eq(documents.title, doc.title) });
    if (existing) {
      index += 1;
      continue;
    }

    const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, subjectId) });
    if (!subject) continue;

    const uploaderId = userIds[index % userIds.length];
    const [created] = await db
      .insert(documents)
      .values({
        title: doc.title,
        description: doc.description,
        type: doc.type as never,
        format: doc.format as never,
        fileUrl: SAMPLE_FILE,
        filePublicId: `seed/${doc.subject}-${index}`,
        fileBytes: doc.fileBytes,
        pages: doc.pages,
        year: doc.year,
        semester: doc.semester as Semester,
        schoolYear: '2025–2026',
        universityId: subject.universityId,
        subjectId,
        uploaderId,
        downloads: doc.downloads,
        views: doc.views,
        ratingAvg: Number((4.4 + (index % 6) * 0.1).toFixed(1)),
        ratingCount: 20 + index * 7,
      })
      .returning({ id: documents.id });

    for (const name of doc.tags) {
      const slug = slugify(name);
      if (!slug) continue;
      const [tag] = await db
        .insert(tags)
        .values({ name, slug })
        .onConflictDoUpdate({ target: tags.slug, set: { name } })
        .returning({ id: tags.id });
      await db
        .insert(documentTags)
        .values({ documentId: created.id, tagId: tag.id })
        .onConflictDoNothing();
    }

    const reviewer = userIds[(index + 1) % userIds.length];
    if (reviewer !== uploaderId) {
      await db
        .insert(reviews)
        .values({
          userId: reviewer,
          documentId: created.id,
          score: 5,
          comment: 'Tài liệu trình bày rõ ràng, đúng trọng tâm. Cảm ơn bạn đã chia sẻ.',
        })
        .onConflictDoNothing();
    }
    index += 1;
  }

  console.log('→ grades for the demo account');
  const demoUser = userIds[0];
  const recorded: Array<[string, number, number]> = [
    ['PRF192', 8.6, 1],
    ['MAE101', 7.8, 1],
    ['SSL101c', 9.0, 1],
    ['PRO192', 8.2, 2],
    ['MAD101', 6.9, 2],
    ['OSG202', 7.4, 3],
    ['CSD201', 8.8, 3],
    ['DBI202', 7.1, 3],
    ['WED201', 9.2, 4],
    ['NWC203', 3.5, 4], // a fail, so the planner has something to block
  ];

  for (const [code, score, termNo] of recorded) {
    const subjectId = se.subjectIds[code];
    if (!subjectId) continue;
    await db
      .insert(grades)
      .values({ userId: demoUser, subjectId, score10: score, termNo })
      .onConflictDoUpdate({
        target: [grades.userId, grades.subjectId],
        set: { score10: score, termNo },
      });
  }

  const [[u], [s], [p], [d], [usr]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(universities),
    db.select({ n: sql<number>`count(*)::int` }).from(subjects),
    db.select({ n: sql<number>`count(*)::int` }).from(subjectPrerequisites),
    db.select({ n: sql<number>`count(*)::int` }).from(documents),
    db.select({ n: sql<number>`count(*)::int` }).from(users),
  ]);

  console.log(`
Seed complete.
  universities  ${u.n}
  subjects      ${s.n}
  prerequisites ${p.n}
  documents     ${d.n}
  users         ${usr.n}

  Demo sign-in:  ngoc.tb@fpt.edu.vn / kaned2026
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
