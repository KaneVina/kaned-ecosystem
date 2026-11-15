/**
 * Seeds a realistic slice of Vietnamese higher education: two universities,
 * a full Software Engineering curriculum with a working prerequisite graph,
 * and a set of documents to browse.
 *
 *   npm run db:seed -w @kaned/api
 */
import bcrypt from 'bcryptjs';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { requirementCodes, type Requirement } from '@kaned/shared';
import { db, sqlClient } from './index.js';
import {
  FPTU_SE,
  FPTU_SE_PASS_MARK,
  FPTU_SE_RENAMES,
  termToYear,
  type CurriculumEntry,
} from './curricula/fptu-se.js';
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

/** HCMUT — Computer Science, a smaller slice for cross-university browsing. */
const CS_CURRICULUM: CurriculumEntry[] = [
  {
    code: 'CO1003', name: 'Introduction to Computing', nameVi: 'Nhập môn điện toán',
    credits: 3, termNo: 1,
    description: 'First programming course in C for engineering students.',
    topics: ['Thuật toán và lưu đồ', 'Ngôn ngữ C', 'Hàm và mảng'],
  },
  {
    code: 'CO2003', name: 'Data Structures and Algorithms', nameVi: 'Cấu trúc dữ liệu và giải thuật',
    credits: 4, termNo: 3,
    description: 'Lists, trees, graphs, hashing and algorithm analysis, taught in C++.',
    topics: ['Phân tích độ phức tạp', 'Danh sách liên kết', 'Cây tìm kiếm', 'Bảng băm', 'Đồ thị'],
    requirements: [{ kind: 'subject', codes: ['CO1003'], min: 'pass' }],
  },
  {
    code: 'CO2013', name: 'Database Systems', nameVi: 'Hệ cơ sở dữ liệu',
    credits: 3, termNo: 4,
    description: 'Relational model, SQL, normalisation and transaction processing.',
    topics: ['Mô hình quan hệ', 'SQL nâng cao', 'Chuẩn hóa', 'Giao tác'],
    requirements: [{ kind: 'subject', codes: ['CO1003'], min: 'pass' }],
  },
  {
    code: 'CO3001', name: 'Software Engineering', nameVi: 'Công nghệ phần mềm',
    credits: 3, termNo: 5,
    description: 'Software processes, requirements, architecture and quality.',
    topics: ['Quy trình phần mềm', 'Phân tích yêu cầu', 'Kiến trúc phần mềm', 'Đảm bảo chất lượng'],
    requirements: [{ kind: 'subject', codes: ['CO2003'], min: 'pass' }],
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

/**
 * Upserts one programme: faculty, major, its subjects, the curriculum rows
 * carrying each subject's requirements, and a flat prerequisite index derived
 * from those requirements for the subject pages. Re-running it on a database
 * seeded by an older version renames moved codes (documents follow) and
 * removes curriculum rows, edges and empty subjects that are no longer part
 * of the programme.
 */
async function seedCurriculum(
  universityId: string,
  faculty: { code: string; name: string; nameVi: string },
  major: { code: string; name: string; nameVi: string; totalCredits: number; passMark: number },
  list: CurriculumEntry[],
  renames: Record<string, string> = {},
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
      set: {
        name: major.name,
        nameVi: major.nameVi,
        totalCredits: major.totalCredits,
        passMark: major.passMark,
      },
    })
    .returning({ id: majors.id });

  // Move renamed codes in place so the documents attached to them follow.
  for (const [from, to] of Object.entries(renames)) {
    const target = await db.query.subjects.findFirst({
      where: and(eq(subjects.universityId, universityId), eq(subjects.code, to)),
    });
    if (target) continue;
    await db
      .update(subjects)
      .set({ code: to })
      .where(and(eq(subjects.universityId, universityId), eq(subjects.code, from)));
  }

  const subjectIds: Record<string, string> = {};

  for (const s of list) {
    const { year, semester } = termToYear(s.termNo);
    const values = {
      name: s.name,
      nameVi: s.nameVi,
      credits: s.credits,
      description: s.description,
      topics: s.topics,
      outcomes: s.outcomes ?? [],
      assessment: s.assessment ?? null,
      typicalYear: year,
      typicalSemester: semester,
      facultyId: facultyRow.id,
    };
    const [row] = await db
      .insert(subjects)
      .values({ ...values, code: s.code, universityId })
      .onConflictDoUpdate({ target: [subjects.universityId, subjects.code], set: values })
      .returning({ id: subjects.id });
    subjectIds[s.code] = row.id;

    const curriculumRow = {
      termNo: s.termNo,
      isRequired: !s.choiceGroup,
      requirements: s.requirements ?? [],
      choiceGroup: s.choiceGroup ?? null,
    };
    await db
      .insert(majorSubjects)
      .values({ majorId: majorRow.id, subjectId: row.id, ...curriculumRow })
      .onConflictDoUpdate({ target: [majorSubjects.majorId, majorSubjects.subjectId], set: curriculumRow });
  }

  const ids = Object.values(subjectIds);

  // Curriculum rows from an older version of this programme.
  await db
    .delete(majorSubjects)
    .where(and(eq(majorSubjects.majorId, majorRow.id), notInArray(majorSubjects.subjectId, ids)));

  // Rebuild the prerequisite index from the requirements. Only top-level
  // subject rules become edges; groups such as "3 of 4" stay in the rules.
  await db.delete(subjectPrerequisites).where(inArray(subjectPrerequisites.subjectId, ids));
  for (const s of list) {
    for (const req of s.requirements ?? []) {
      if (req.kind !== 'subject') continue;
      for (const code of req.codes) {
        const requiresId = subjectIds[code];
        if (!requiresId) continue;
        await db
          .insert(subjectPrerequisites)
          .values({
            subjectId: subjectIds[s.code],
            requiresId,
            type: 'PREREQUISITE',
            minScore: req.min === 'pass' ? null : req.min,
          })
          .onConflictDoNothing();
      }
    }
  }

  // Subjects of this university that no programme uses and nobody uploaded to.
  const orphans = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      and(
        eq(subjects.universityId, universityId),
        sql`not exists (select 1 from ${majorSubjects} ms where ms.subject_id = ${subjects.id})`,
        sql`not exists (select 1 from ${documents} d where d.subject_id = ${subjects.id})`,
      ),
    );
  if (orphans.length) {
    await db.delete(subjects).where(inArray(subjects.id, orphans.map((o) => o.id)));
  }

  return { facultyId: facultyRow.id, majorId: majorRow.id, subjectIds };
}

/** Sanity check: every code a rule mentions should be a subject of the programme or a known alternative. */
function reportUnknownCodes(label: string, list: CurriculumEntry[]) {
  const known = new Set(list.map((s) => s.code));
  const unknown = new Set<string>();
  for (const s of list) {
    for (const req of s.requirements ?? []) {
      for (const code of requirementCodes(req as Requirement)) if (!known.has(code)) unknown.add(code);
    }
  }
  if (unknown.size) {
    console.log(`  ${label}: alternatives outside the programme (kept as-is): ${[...unknown].join(', ')}`);
  }
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
    {
      code: 'SE',
      name: 'Software Engineering',
      nameVi: 'Kỹ thuật phần mềm',
      totalCredits: FPTU_SE.filter((s) => !s.choiceGroup).reduce((n, s) => n + s.credits, 0) + 10,
      passMark: FPTU_SE_PASS_MARK,
    },
    FPTU_SE,
    FPTU_SE_RENAMES,
  );
  reportUnknownCodes('FPTU SE', FPTU_SE);

  console.log('→ HCMUT Computer Science curriculum');
  const cs = await seedCurriculum(
    universityIds.HCMUT,
    { code: 'CSE', name: 'Computer Science and Engineering', nameVi: 'Khoa học và Kỹ thuật Máy tính' },
    { code: 'CS', name: 'Computer Science', nameVi: 'Khoa học máy tính', totalCredits: 142, passMark: 4 },
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
    const subjectId = subjectIds[FPTU_SE_RENAMES[doc.subject] ?? doc.subject];
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
  // A student in term 5. DBI202 is 4.5: not a pass (5.0), but enough for
  // PRJ301, which only asks for ≥ 4. JPD113 at 3.8 holds back JPD123.
  const recorded: Array<[code: string, score: number | null, termNo: number, inProgress?: boolean]> = [
    ['PRF192', 8.6, 1], ['CEA201', 7.2, 1], ['CSI104', 8.0, 1], ['MAE101', 7.8, 1], ['SSL101c', 9.0, 1],
    ['PRO192', 8.2, 2], ['OSG202', 7.4, 2], ['NWC204', 6.5, 2], ['MAD101', 6.9, 2], ['SSG104', 8.5, 2],
    ['LAB211', 8.0, 3], ['CSD201', 8.8, 3], ['DBI202', 4.5, 3], ['JPD113', 3.8, 3], ['WED201c', 9.2, 3],
    ['PRJ301', 7.6, 4], ['IOT102', 7.0, 4], ['MAS291', 6.2, 4], ['SWE201c', 8.1, 4],
    ['SWP391', null, 5, true], ['FER202', null, 5, true],
  ];

  // Start the demo account from a clean slate so re-seeding is predictable.
  await db.delete(grades).where(eq(grades.userId, demoUser));
  for (const [code, score, termNo, inProgress = false] of recorded) {
    const subjectId = se.subjectIds[code];
    if (!subjectId) continue;
    await db.insert(grades).values({ userId: demoUser, subjectId, score10: score, termNo, inProgress });
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
