export type ViewMode = "code" | "preview" | "visual";
export type PreviewViewport = "desktop" | "mobile";
export type EnvStatus = "warming-up" | "waiting" | "ready";

export type TreeNode = {
	name: string;
	path: string;
	kind: "directory" | "file";
	children: TreeNode[];
};

export type FlatNode = {
	node: TreeNode;
	depth: number;
};

export type FileBuffer = {
	savedContent: string;
	editorValue: string;
	loaded: boolean;
};

export type VisualEditorPayload = {
	tag: string;
	id: string;
	classes: string;
	text: string;
	html: string;
	manifestKey: string | null;
	componentName: string | null;
	parents: string;
	url: string;
	path: string;
	viewport: { width: number; height: number };
	position: { x: number; y: number };
};

export type CmsInspectPayload = {
	manifestKey: string;
	sectionIndex: number;
	tag: string;
	id: string;
	classes: string;
	text: string;
	html: string;
	componentName: string | null;
	parents: string;
	url: string;
	path: string;
	viewport: { width: number; height: number };
	position: { x: number; y: number };
};
