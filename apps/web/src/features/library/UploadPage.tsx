import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  CloudUpload,
  FileCheck,
  FileText,
  FileUp,
  FolderOpen,
  Github,
  Link2,
  ListChecks,
  ScrollText,
  Trash2,
  X,
} from "lucide-react";
import {
  createDocumentSchema,
  MAX_UPLOAD_BYTES,
  MIME_TO_FORMAT,
  type CreateDocumentInput,
  type DocumentSummaryDto,
  detectLinkProvider,
  isPreviewableLink,
  isWebUrl,
  normalizeGithubInput,
  type FileFormat,
} from "@kaned/shared";
import { PageHead } from "@/components/ui/Panel";
import { FileIcon } from "@/components/ui/FileBadge";
import { DocCard } from "@/components/library/DocCard";
import { useCreateDocument, useLinkPreview, uploadToCloudinary } from "./queries";
import { LinkCheck } from "@/components/library/LinkCheck";
import { InternalFields, type InternalValue } from "@/components/library/InternalFields";
import { providerTitle } from "@/components/library/LinkViewer";
import { useIdempotencyKey } from "@/lib/useIdempotencyKey";
import { useSubjects, useUniversities } from "@/features/catalog/queries";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/providers/ToastProvider";
import { toApiError } from "@/lib/api";
import { fmtBytes } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PlacementFields, TagInput, TypePicker } from "@/components/documents/DocumentFields";
import {
  GithubSource,
  githubStatusMessage,
  githubStatusUsable,
  type GithubStatus,
} from "@/components/documents/GithubSource";

const EXT_TO_FORMAT: Record<string, FileFormat> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  xlsx: "XLSX",
  html: "HTML",
  htm: "HTML",
  md: "MD",
  markdown: "MD",
  drawio: "DRAWIO",
  dio: "DRAWIO",
};

/** The form's own schema: the API's, minus what the upload fills in, plus the rights box. */
const uploadSchema = createDocumentSchema
  .omit({ fileUrl: true, filePublicId: true, fileBytes: true, format: true })
  .extend({
    academicTermId: z
      .string()
      .optional()
      .transform((v) => (v ? v : null)),
    folderId: z
      .string()
      .optional()
      .transform((v) => (v ? v : null)),
    rights: z
      .boolean()
      .refine((v) => v, {
        message: "Xác nhận bạn có quyền chia sẻ tài liệu này.",
      }),
  });
type Form = z.infer<typeof uploadSchema>;

export function UploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  // Opened from a subject or one of its folders: that subject and folder are pre-filled.
  const [params] = useSearchParams();
  const ctxUniversity = params.get("university") ?? "";
  const ctxSubject = params.get("subject") ?? "";
  const ctxFolder = params.get("folder") ?? "";
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ file: File; format: FileFormat } | null>(
    null,
  );
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [source, setSource] = useState<"file" | "link" | "github">(
    params.get("source") === "github" ? "github" : "file",
  );
  const [link, setLink] = useState("");
  const [access, setAccess] = useState<InternalValue>({ internal: false, allowDownload: true, allowShare: true });
  const [ghUrl, setGhUrl] = useState("");
  const [guide, setGuide] = useState("");
  const [ghStatus, setGhStatus] = useState<GithubStatus>("empty");
  const linkOk = isWebUrl(link.trim());
  const provider = linkOk ? detectLinkProvider(link.trim()) : null;
  // YouTube and Canva links are checked on the server once typing stops: title, cover, who can see it.
  const [linkQuery, setLinkQuery] = useState<string | null>(null);
  useEffect(() => {
    const next = source === "link" && linkOk && isPreviewableLink(link.trim()) ? link.trim() : null;
    const t = setTimeout(() => setLinkQuery(next), next ? 450 : 0);
    return () => clearTimeout(t);
  }, [source, linkOk, link]);
  const linkPreview = useLinkPreview(linkQuery);
  const lp = linkPreview.data && linkQuery === link.trim() ? linkPreview.data : null;
  const linkThumb = source === "link" ? (lp?.thumbnailUrl ?? provider?.thumbnailUrl ?? null) : null;
  // A finished upload is kept, so trying again after a failed save does not upload twice.
  const uploaded = useRef<{ file: File; url: string; publicId: string; bytes: number; pages?: number } | null>(null);
  const idempotency = useIdempotencyKey();
  const hasSource =
    source === "file" ? Boolean(file) : source === "link" ? linkOk : githubStatusUsable(ghStatus);
  const sourceError = () =>
    source === "file"
      ? "Chọn một tệp để tải lên."
      : source === "link"
        ? "Dán một liên kết bắt đầu bằng https://"
        : githubStatusMessage(ghStatus);

  const createDocument = useCreateDocument();
  const { data: universities = [] } = useUniversities();

  const form = useForm<Form>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      title: "",
      description: "",
      type: undefined as never,
      universityId: ctxUniversity || user?.university?.id || "",
      subjectId: ctxSubject,
      year: user?.year ?? 2,
      semester: undefined as never,
      schoolYear: "2025–2026",
      academicTermId: "",
      folderId: ctxFolder,
      lecturer: "",
      period: "",
      tags: [],
      language: "Vietnamese",
      rights: false,
    },
  });
  const v = form.watch();
  const { errors } = form.formState;
  const { data: subjectPage } = useSubjects(
    { universityId: v.universityId || undefined, pageSize: 200 },
    { enabled: Boolean(v.universityId) },
  );
  const subjects = subjectPage?.items ?? [];
  const subject = subjects.find((s) => s.id === v.subjectId);

  // The selects are uncontrolled: re-apply the pre-filled values once their options exist.
  useEffect(() => {
    if (universities.length)
      form.setValue("universityId", form.getValues("universityId"));
  }, [universities.length, form]);
  useEffect(() => {
    if (subjects.length)
      form.setValue("subjectId", form.getValues("subjectId"));
  }, [subjects.length, form]);
  const university = universities.find((u) => u.id === v.universityId);

  const accept = (f: File) => {
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    const format = MIME_TO_FORMAT[f.type] ?? EXT_TO_FORMAT[ext];
    if (!format) {
      setFileError(
        `“${f.name}” là file .${ext || "?"}. Hãy tải lên PDF, Word, PowerPoint, Excel, HTML, draw.io hoặc Markdown.`,
      );
      toast.error(
        "Định dạng không hỗ trợ",
        "Kaned nhận PDF, DOCX, PPTX, XLSX, HTML, MD và draw.io.",
      );
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setFileError(
        `File nặng ${fmtBytes(f.size)}. Giới hạn là ${fmtBytes(MAX_UPLOAD_BYTES)} — thử nén hoặc tách theo chương.`,
      );
      toast.error("File quá lớn", `Giới hạn ${fmtBytes(MAX_UPLOAD_BYTES)}.`);
      return;
    }
    setFileError("");
    setFile({ file: f, format });
    if (!form.getValues("title").trim()) {
      form.setValue(
        "title",
        f.name
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 150),
      );
    }
  };

  const tags = v.tags ?? [];

  // A pasted GitHub address fills the title and description, only where they are still empty.
  // An earlier suggestion the student has not touched is replaced by the newer one.
  const suggested = useRef({ title: "", description: "" });
  const suggestFromGithub = useCallback(
    ({ title, description }: { title: string; description: string }) => {
      const cur = { title: form.getValues("title").trim(), description: form.getValues("description").trim() };
      if (title && (!cur.title || cur.title === suggested.current.title)) form.setValue("title", title);
      if (description && (!cur.description || cur.description === suggested.current.description)) form.setValue("description", description);
      suggested.current = { title, description };
    },
    [form],
  );

  // A video or design title fills the form the same way.
  useEffect(() => {
    if (!lp?.title) return;
    const kind = providerTitle(lp.provider);
    suggestFromGithub({
      title: lp.title.slice(0, 180),
      description: `${kind} “${lp.title}”${lp.author ? ` của ${lp.author}` : ""}, xem trực tiếp trên Kaned.`.slice(0, 2000),
    });
  }, [lp?.title, lp?.author, lp?.provider, suggestFromGithub]);

  const checklist: Array<[string, boolean]> = [
    [source === "file" ? "Tệp tài liệu" : source === "link" ? "Liên kết" : "Liên kết GitHub", hasSource],
    ["Tiêu đề", (v.title ?? "").trim().length >= 10],
    ["Mô tả", (v.description ?? "").trim().length >= 30],
    ["Loại tài liệu", Boolean(v.type)],
    [
      "Thông tin môn học",
      Boolean(v.universityId && v.subjectId && v.year && v.semester),
    ],
    ["Xác nhận quyền chia sẻ", Boolean(v.rights)],
  ];
  const done = checklist.filter(([, ok]) => ok).length;

  const previewDoc: DocumentSummaryDto | null =
    subject && university
      ? {
          id: "preview",
          title: v.title || "Tiêu đề tài liệu của bạn",
          description: v.description,
          type: v.type ?? "NOTES",
          format: source === "link" ? "LINK" : source === "github" ? "GITHUB" : (file?.format ?? "PDF"),
          fileBytes: source === "file" ? (file?.file.size ?? 1_200_000) : 0,
          linkUrl: source === "link" && linkOk ? (lp?.url ?? link.trim()) : source === "github" ? ghUrl.trim() || null : null,
          guide: null,
          term: null,
          folder: null,
          pages: 12,
          thumbnailUrl: linkThumb,
          internal: access.internal,
          allowDownload: !access.internal || access.allowDownload,
          allowShare: !access.internal || access.allowShare,
          linkProvider: source === "link" ? (provider?.id ?? null) : source === "github" ? "github" : null,
          year: Number(v.year) || 1,
          semester: v.semester ?? "S1",
          schoolYear: v.schoolYear ?? null,
          language: "Vietnamese",
          downloads: 0,
          views: 0,
          ratingAvg: 0,
          ratingCount: 0,
          status: "PUBLISHED",
          createdAt: new Date().toISOString(),
          subject,
          university: {
            id: university.id,
            code: university.code,
            name: university.name,
            nameVi: university.nameVi,
            color: university.color,
          },
          uploader: {
            id: user?.id ?? "me",
            name: user?.name ?? "Bạn",
            avatarUrl: user?.avatarUrl ?? null,
            universityId: null,
            year: user?.year ?? null,
          },
          tags,
        }
      : null;

  const onSubmit = form.handleSubmit(
    async (values) => {
      setSubmitted(true);
      if (!hasSource) {
        setFileError(sourceError());
        document.querySelector(".up-sec")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      try {
        const { rights: _rights, ...rest } = values;
        let sourceFields: Pick<CreateDocumentInput, "format" | "fileUrl" | "filePublicId" | "fileBytes" | "pages" | "guide" | "thumbnailUrl">;
        if (source === "link") {
          sourceFields = { format: "LINK", fileUrl: lp?.url ?? link.trim(), filePublicId: "", fileBytes: 0, thumbnailUrl: linkThumb };
        } else if (source === "github") {
          sourceFields = { format: "GITHUB", fileUrl: normalizeGithubInput(ghUrl), filePublicId: "", fileBytes: 0, guide: guide.trim() || null };
        } else {
          if (uploaded.current?.file !== file!.file) {
            setProgress(0);
            const result = await uploadToCloudinary(file!.file, setProgress);
            uploaded.current = { file: file!.file, url: result.url, publicId: result.publicId, bytes: result.bytes, pages: result.pages };
          }
          const u = uploaded.current!;
          sourceFields = { format: file!.format, fileUrl: u.url, filePublicId: u.publicId, fileBytes: u.bytes, pages: u.pages };
        }
        const input: CreateDocumentInput = {
          ...rest,
          ...sourceFields,
          internal: access.internal,
          allowDownload: !access.internal || access.allowDownload,
          allowShare: !access.internal || access.allowShare,
        };
        const created = await createDocument.mutateAsync({ input, idempotencyKey: idempotency.keyFor(input) });
        idempotency.done();
        toast.success(
          "Đã đăng tài liệu",
          "Cảm ơn bạn — lớp sau sẽ tìm thấy nó trong thư viện.",
        );
        navigate(`/app/library/${created.id}`);
      } catch (error) {
        const err = toApiError(error);
        if (err.fields)
          for (const [f, m] of Object.entries(err.fields))
            form.setError(f as keyof Form, { message: m });
        toast.error("Không đăng được tài liệu", err.message);
      } finally {
        setProgress(null);
      }
    },
    () => {
      setSubmitted(true);
      if (!hasSource) setFileError(sourceError());
      document
        .querySelector(".field.invalid")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  );

  const errorCount = Object.keys(errors).length + (fileError ? 1 : 0);
  const busy = progress !== null || createDocument.isPending;

  return (
    <>
      <PageHead
        crumbs={[
          { label: "Thư viện", to: "/app/library" },
          { label: "Tải lên" },
        ]}
        title="Chia sẻ tài liệu"
        description="Chia sẻ tài liệu từ môn bạn đã học. Điền đúng thông tin môn học — đó là cách sinh viên cùng lớp tìm thấy nó."
      />
      <div className="container upload-layout">
        <form className="upload-form" onSubmit={onSubmit} noValidate>
          {submitted && errorCount > 0 && (
            <div className="form-errors" role="alert">
              <CircleAlert className="ic" />
              <div>
                <b>Còn {errorCount} mục cần sửa trước khi đăng.</b>
                <p>Các ô được đánh dấu đỏ bên dưới.</p>
              </div>
            </div>
          )}

          <section className="panel up-sec">
            <div className="up-sec-head">
              <span className="up-step">1</span>
              <div>
                <h2 className="t-h3">Nguồn tài liệu</h2>
                <p>
                  {source === "file"
                    ? `PDF, Word, PowerPoint, Excel, HTML, Markdown (.md) hoặc draw.io (.drawio), tối đa ${fmtBytes(MAX_UPLOAD_BYTES)}.`
                    : source === "link"
                      ? "Google Slides, Docs, Drive, Canva, YouTube, Notion… hoặc bất kỳ trang nào."
                      : "Tài liệu bạn để trên GitHub. Kaned tự tạo nút tải ZIP, danh sách tệp và lệnh git cho người xem."}
                </p>
              </div>
              <div className="seg up-source" role="group" aria-label="Nguồn tài liệu">
                <button type="button" aria-pressed={source === "file"} onClick={() => (setSource("file"), setFileError(""))}>
                  <CloudUpload className="ic ic-sm" />
                  Tải tệp lên
                </button>
                <button type="button" aria-pressed={source === "link"} onClick={() => (setSource("link"), setFileError(""))}>
                  <Link2 className="ic ic-sm" />
                  Dán liên kết
                </button>
                <button type="button" aria-pressed={source === "github"} onClick={() => (setSource("github"), setFileError(""))}>
                  <Github className="ic ic-sm" />
                  GitHub
                </button>
              </div>
            </div>
            {source === "github" ? (
              <GithubSource
                id="up-gh"
                value={ghUrl}
                onChange={(next) => {
                  setGhUrl(next);
                  if (fileError) setFileError("");
                }}
                guide={guide}
                onGuide={setGuide}
                onStatus={setGhStatus}
                onSuggest={suggestFromGithub}
                error={fileError}
              />
            ) : (
            <div className={cn("field", fileError && "invalid")}>
              {source === "link" ? (
                <div className="up-link">
                  <div className="input-group">
                    <Link2 className="ic ic-sm" />
                    <input
                      className="input"
                      type="url"
                      inputMode="url"
                      placeholder="Google Slides, Drive, YouTube, Canva… https://"
                      value={link}
                      onChange={(e) => {
                        setLink(e.target.value);
                        if (fileError) setFileError("");
                      }}
                      aria-label="Liên kết tài liệu"
                    />
                  </div>
                  {provider?.id === "github" ? (
                    <div className="gh-note is-warn gh-switch">
                      <Github className="ic ic-sm" />
                      <span>Đây là liên kết GitHub. Đăng ở mục GitHub để người xem thấy danh sách tệp và tải được ZIP.</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setGhUrl(link.trim());
                          setLink("");
                          setSource("github");
                        }}
                      >
                        Chuyển sang GitHub
                      </button>
                    </div>
                  ) : provider && (provider.id === "youtube" || provider.id === "canva") ? (
                    <LinkCheck
                      provider={provider}
                      preview={lp}
                      loading={Boolean(linkQuery) && (linkPreview.isLoading || linkPreview.isFetching) || linkQuery !== link.trim()}
                      onRetry={() => linkPreview.refetch()}
                    />
                  ) : provider && (
                    <div className="up-link-ok">
                      <CircleCheck className="ic ic-sm" />
                      <span>
                        <b>{provider.label}</b> · {provider.host}
                        {provider.embedUrl ? " — sẽ xem được ngay trên Kaned" : " — mở ở tab mới khi bấm xem"}
                      </span>
                    </div>
                  )}
                  {!(provider?.id === "youtube" || provider?.id === "canva") && (
                    <p className="hint">Nhớ bật chia sẻ “Bất kỳ ai có đường liên kết đều xem được”, nếu không người khác sẽ không mở được.</p>
                  )}
                </div>
              ) : !file ? (
                <div
                  className={cn("dropzone", dragging && "drag")}
                  tabIndex={0}
                  role="button"
                  aria-label="Chọn tệp để tải lên, hoặc kéo thả vào đây"
                  onClick={() => input.current?.click()}
                  onKeyDown={(e) =>
                    (e.key === "Enter" || e.key === " ") &&
                    (e.preventDefault(), input.current?.click())
                  }
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) accept(f);
                  }}
                >
                  <input
                    ref={input}
                    type="file"
                    hidden
                    accept=".pdf,.docx,.pptx,.xlsx,.html,.htm,.md,.markdown,.drawio,.dio"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) accept(f);
                      e.target.value = "";
                    }}
                  />
                  <span className="dz-ic">
                    <CloudUpload className="ic ic-xl" />
                  </span>
                  <p className="dz-title">
                    <b>Kéo thả tệp vào đây</b>
                    <span>hoặc</span>
                  </p>
                  <span className="btn btn-secondary btn-sm dz-btn">
                    <FolderOpen className="ic ic-sm" />
                    Chọn tệp
                  </span>
                  <p className="dz-hint">
                    <span className="ft ft-pdf">PDF</span>
                    <span className="ft ft-docx">DOCX</span>
                    <span className="ft ft-pptx">PPTX</span>
                    <span className="ft ft-xlsx">XLSX</span>
                    <span>Tối đa {fmtBytes(MAX_UPLOAD_BYTES)}</span>
                  </p>
                  <span className="dz-drop">
                    <FileUp className="ic ic-xl" />
                    <b>Thả để tải lên</b>
                  </span>
                </div>
              ) : (
                <div
                  className={cn(
                    "file-pill",
                    progress !== null ? "checking" : "ready",
                  )}
                  style={{ ["--p" as string]: `${progress ?? 100}%` }}
                >
                  <FileIcon format={file.format} />
                  <div className="fp-main">
                    <b className="clamp-1">{file.file.name}</b>
                    <span className="fp-sub">
                      {fmtBytes(file.file.size)}{" "}
                      {progress !== null ? (
                        `— đang tải lên ${progress}%`
                      ) : (
                        <>
                          <CircleCheck className="ic ic-xs" /> Sẵn sàng đăng
                        </>
                      )}
                    </span>
                    <span className="fp-bar">
                      <i style={{ width: `${progress ?? 100}%` }} />
                    </span>
                  </div>
                  {progress === null && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setFile(null)}
                      aria-label="Bỏ tệp"
                    >
                      <Trash2 className="ic ic-sm" />
                    </button>
                  )}
                </div>
              )}
              <span className="error-text">
                <CircleAlert className="ic ic-xs" />
                <span>{fileError}</span>
              </span>
            </div>
            )}
          </section>

          <section className="panel up-sec">
            <div className="up-sec-head">
              <span className="up-step">2</span>
              <div>
                <h2 className="t-h3">Mô tả tài liệu</h2>
                <p>Đặt tiêu đề theo cách một bạn cùng lớp sẽ gõ để tìm.</p>
              </div>
            </div>
            <div className={cn("field", errors.title && "invalid")}>
              <label className="label" htmlFor="up-title">
                Tiêu đề <span className="req">*</span>
              </label>
              <input
                className="input"
                id="up-title"
                maxLength={150}
                placeholder="Ví dụ: Đề thi cuối kỳ CSD201 – Spring 2026 (có đáp án)"
                {...form.register("title")}
              />
              <div className="field-row">
                <span className="hint">Ghi rõ môn, chương hoặc kỳ thi.</span>
                <span className="error-text">
                  <CircleAlert className="ic ic-xs" />
                  <span>
                    {errors.title?.message && "Tiêu đề cần ít nhất 10 ký tự."}
                  </span>
                </span>
                <span className="counter">{(v.title ?? "").length}/150</span>
              </div>
            </div>
            <div className={cn("field", errors.description && "invalid")}>
              <label className="label" htmlFor="up-desc">
                Mô tả <span className="req">*</span>
              </label>
              <textarea
                className="textarea"
                id="up-desc"
                maxLength={1000}
                placeholder="Bên trong có gì, gồm những chương nào, có đáp án không…"
                {...form.register("description")}
              />
              <div className="field-row">
                <span className="hint">Ít nhất 30 ký tự.</span>
                <span className="error-text">
                  <CircleAlert className="ic ic-xs" />
                  <span>
                    {errors.description && "Viết mô tả ít nhất 30 ký tự."}
                  </span>
                </span>
                <span className="counter">
                  {(v.description ?? "").length}/1000
                </span>
              </div>
            </div>
            <TypePicker
              name="up-type"
              value={v.type}
              invalid={Boolean(errors.type)}
              onChange={(t) => form.setValue("type", t, { shouldValidate: submitted })}
            />
            <TagInput
              id="up-tag"
              value={tags}
              onChange={(next) => form.setValue("tags", next)}
              draft={tagDraft}
              onDraft={setTagDraft}
              suggestions={subject ? [subject.code, subject.nameVi.toLowerCase()] : []}
            />
          </section>

          <section className="panel up-sec">
            <div className="up-sec-head">
              <span className="up-step">3</span>
              <div>
                <h2 className="t-h3">Xếp vào môn học</h2>
                <p>
                  Kaned đã điền sẵn theo hồ sơ của bạn. Sửa lại chỗ nào không
                  khớp.
                </p>
              </div>
            </div>
            <PlacementFields
              idPrefix="up"
              value={{
                universityId: v.universityId ?? "",
                subjectId: v.subjectId ?? "",
                folderId: v.folderId ?? "",
                academicTermId: v.academicTermId ?? "",
                semester: v.semester ?? "",
                schoolYear: v.schoolYear ?? "",
                period: v.period ?? "",
                year: v.year ?? "",
                lecturer: v.lecturer ?? "",
                lecturerId: v.lecturerId ?? null,
              }}
              onChange={(patch) => {
                for (const [key, val] of Object.entries(patch)) {
                  form.setValue(key as keyof Form, val as never, { shouldValidate: submitted });
                }
              }}
              errors={{
                universityId: Boolean(errors.universityId),
                subjectId: Boolean(errors.subjectId),
                semester: Boolean(errors.semester),
                year: Boolean(errors.year),
              }}
            />
          </section>

          <section className="panel up-sec">
            <div className="up-sec-head">
              <span className="up-step">4</span>
              <div>
                <h2 className="t-h3">Đăng</h2>
                <p>
                  Tài liệu được kiểm tra tự động rồi hiện lên thư viện ngay.
                </p>
              </div>
            </div>
            <InternalFields value={access} onChange={setAccess} source={source} provider={source === "link" ? provider : null} />
            <div className={cn("field", errors.rights && "invalid")}>
              <label className="check check-top">
                <input type="checkbox" {...form.register("rights")} />
                <span className="box">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <span>
                  Tôi là người viết tài liệu này hoặc được phép chia sẻ nó, và
                  nó tuân theo quy tắc cộng đồng.
                </span>
              </label>
              <span className="error-text">
                <CircleAlert className="ic ic-xs" />
                <span>{errors.rights?.message}</span>
              </span>
            </div>
            <div className="up-submit">
              <Link to="/app/library" className="btn btn-ghost">
                Huỷ
              </Link>
              <button
                type="submit"
                className={cn("btn btn-primary btn-lg", busy && "is-loading")}
                disabled={busy}
              >
                <CloudUpload className="ic ic-sm" />
                Đăng tài liệu
              </button>
            </div>
          </section>
        </form>

        <aside className="upload-side">
          <div className="panel panel-pad up-preview">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 className="t-h4">Xem trước</h2>
              <span className="t-xs">
                {done}/{checklist.length} xong
              </span>
            </div>
            <p className="t-small" style={{ margin: "2px 0 14px" }}>
              Tài liệu của bạn sẽ hiện trong thư viện thế này.
            </p>
            {previewDoc ? (
              <div className="up-card-inert" aria-hidden>
                <DocCard doc={previewDoc} />
              </div>
            ) : (
              <div className="up-card-empty">
                <FileText className="ic ic-xl" />
                <p>Chọn môn học để xem thẻ tài liệu.</p>
              </div>
            )}
            <ul className="checklist">
              {checklist.map(([label, ok]) => (
                <li key={label} className={ok ? "ok" : undefined}>
                  {ok ? (
                    <CircleCheck className="ic ic-sm" />
                  ) : (
                    <CircleDot className="ic ic-sm" />
                  )}
                  {label}
                </li>
              ))}
            </ul>
          </div>
          <div className="panel panel-pad up-tips">
            <h2 className="t-h4">Tài liệu nào được tải nhiều nhất</h2>
            <ul>
              <li>
                <FileCheck className="ic ic-sm" />
                <span>
                  <b>Đề thi có đáp án.</b> Ghi rõ kỳ thi và có lời giải hay
                  chưa.
                </span>
              </li>
              <li>
                <ListChecks className="ic ic-sm" />
                <span>
                  <b>Trọn chương.</b> Một file mỗi chương dễ tìm hơn một file
                  300 trang.
                </span>
              </li>
              <li>
                <ScrollText className="ic ic-sm" />
                <span>
                  <b>Bản scan rõ nét.</b> Scan vở viết tay ở 300 dpi, đủ sáng.
                </span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
