import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDocumentInput,
  DocumentDetailDto,
  DocumentQuery,
  DocumentSummaryDto,
  Paginated,
  ReviewDto,
  ReviewInput,
  UploadSignatureDto,
  LinkPreviewDto,
  DriveFolderDto,
} from '@kaned/shared';
import { withKey, http } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

export type LibraryFilters = Partial<DocumentQuery>;

/** Turns the filter state into the flat query string the API expects. */
export function toParams(filters: LibraryFilters): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params[key] = value.join(',');
    } else {
      params[key] = String(value);
    }
  }
  return params;
}

export function useDocuments(filters: LibraryFilters, options: { enabled?: boolean } = {}) {
  const params = toParams(filters);
  return useQuery({
    queryKey: queryKeys.documents(params),
    queryFn: async () => {
      const { data } = await http.get<Paginated<DocumentSummaryDto>>('/documents', { params });
      return data;
    },
    placeholderData: (previous) => previous,
    enabled: options.enabled ?? true,
  });
}

export function useDocumentFacets(filters: LibraryFilters) {
  const params = toParams({ ...filters, page: undefined, pageSize: undefined });
  return useQuery({
    queryKey: ['documents', 'facets', params],
    queryFn: async () => {
      const { data } = await http.get<{
        type: Record<string, number>;
        format: Record<string, number>;
        universityId: Record<string, number>;
        subjectId: Record<string, number>;
      }>('/documents/facets', { params });
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: queryKeys.document(id),
    queryFn: async () => {
      const { data } = await http.get<DocumentDetailDto>(`/documents/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useSavedDocuments() {
  return useQuery({
    queryKey: queryKeys.saved,
    queryFn: async () => {
      const { data } = await http.get<DocumentSummaryDto[]>('/documents/saved/mine');
      return data;
    },
  });
}

export function useToggleBookmark() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      const { data } = await http.post<{ bookmarked: boolean }>(`/documents/${documentId}/bookmark`);
      return { documentId, ...data };
    },
    onSuccess: ({ documentId, bookmarked }) => {
      // Patch the caches we already have instead of refetching everything.
      client.setQueriesData<Paginated<DocumentSummaryDto>>({ queryKey: ['documents', 'list'] }, (old) =>
        old
          ? { ...old, items: old.items.map((d) => (d.id === documentId ? { ...d, isBookmarked: bookmarked } : d)) }
          : old,
      );
      client.setQueryData<DocumentDetailDto>(queryKeys.document(documentId), (old) =>
        old ? { ...old, isBookmarked: bookmarked } : old,
      );
      void client.invalidateQueries({ queryKey: queryKeys.saved });
    },
  });
}

export function useDownload() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      const { data } = await http.post<{ fileUrl: string; title: string; downloads: number }>(
        `/documents/${documentId}/download`,
      );
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useCreateReview(documentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReviewInput) => {
      const { data } = await http.post<ReviewDto>(`/documents/${documentId}/reviews`, input);
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.document(documentId) });
    },
  });
}

export function useCreateDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, idempotencyKey }: { input: CreateDocumentInput; idempotencyKey?: string }) => {
      const { data } = await http.post<DocumentSummaryDto>('/documents', input, idempotencyKey ? withKey(idempotencyKey) : undefined);
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

/**
 * Uploads go straight from the browser to Cloudinary using a signature from
 * the API, so a 50 MB file never travels through our server.
 */
export async function uploadToCloudinary(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ url: string; publicId: string; bytes: number; pages?: number }> {
  const { data: signature } = await http.post<UploadSignatureDto>('/uploads/signature', {
    filename: file.name,
    bytes: file.size,
    mimeType: file.type,
  });

  if (signature.mode === 'local') {
    const form = new FormData();
    form.append('file', file);
    const { data } = await http.post<{ url: string; publicId: string; bytes: number; pages?: number }>(
      '/uploads/direct',
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
        },
      },
    );
    return data;
  }

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  form.append('public_id', signature.publicId);

  const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', signature.uploadUrl);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve(JSON.parse(request.responseText));
      else reject(new Error('Tải tệp lên Cloudinary thất bại.'));
    };
    request.onerror = () => reject(new Error('Mất kết nối khi đang tải tệp lên.'));
    request.send(form);
  });

  return {
    url: String(response.secure_url),
    publicId: String(response.public_id),
    bytes: Number(response.bytes ?? file.size),
    pages: typeof response.pages === 'number' ? response.pages : undefined,
  };
}

/** Title, cover and visibility of a YouTube or Canva link (null skips the lookup). */
export function useLinkPreview(url: string | null) {
  return useQuery({
    queryKey: ['link-preview', url],
    queryFn: async () => {
      const { data } = await http.get<LinkPreviewDto>('/links/preview', { params: { url } });
      return data;
    },
    enabled: Boolean(url),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** What is inside a Google Drive folder (null skips the lookup). */
export function useDriveFolder(id: string | null) {
  return useQuery({
    queryKey: ['drive-folder', id],
    queryFn: async () => {
      const { data } = await http.get<DriveFolderDto>('/links/drive-folder', { params: { id } });
      return data;
    },
    enabled: Boolean(id),
    staleTime: 2 * 60_000,
    retry: false,
  });
}
