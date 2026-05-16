import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignInAction = vi.fn();
const mockSignUpAction = vi.fn();

vi.mock("@/actions", () => ({
  signIn: (...args: any[]) => mockSignInAction(...args),
  signUp: (...args: any[]) => mockSignUpAction(...args),
}));

const mockGetAnonWorkData = vi.fn();
const mockClearAnonWork = vi.fn();

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: () => mockGetAnonWorkData(),
  clearAnonWork: () => mockClearAnonWork(),
}));

const mockGetProjects = vi.fn();
const mockCreateProject = vi.fn();

vi.mock("@/actions/get-projects", () => ({
  getProjects: () => mockGetProjects(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: (...args: any[]) => mockCreateProject(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAnonWorkData.mockReturnValue(null);
  mockGetProjects.mockResolvedValue([]);
  mockCreateProject.mockResolvedValue({ id: "new-project-1" });
});

describe("useAuth initial state", () => {
  test("isLoading starts as false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  test("exposes signIn, signUp, and isLoading", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(typeof result.current.isLoading).toBe("boolean");
  });
});

describe("signIn", () => {
  test("calls signInAction with email and password", async () => {
    mockSignInAction.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockSignInAction).toHaveBeenCalledWith("user@example.com", "password123");
  });

  test("returns the result from signInAction", async () => {
    const authResult = { success: false, error: "Invalid credentials" };
    mockSignInAction.mockResolvedValue(authResult);

    const { result } = renderHook(() => useAuth());
    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.signIn("user@example.com", "wrong");
    });

    expect(returnValue).toEqual(authResult);
  });

  test("sets isLoading to true during execution and false after", async () => {
    let resolveSignIn!: (v: any) => void;
    mockSignInAction.mockReturnValue(new Promise((res) => { resolveSignIn = res; }));

    const { result } = renderHook(() => useAuth());

    act(() => { result.current.signIn("user@example.com", "password123"); });
    expect(result.current.isLoading).toBe(true);

    await act(async () => { resolveSignIn({ success: false }); });
    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false even when signInAction throws", async () => {
    mockSignInAction.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("does not call handlePostSignIn when sign-in fails", async () => {
    mockSignInAction.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "wrong");
    });

    expect(mockGetProjects).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("redirects to existing project when sign-in succeeds and projects exist", async () => {
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([{ id: "proj-42" }, { id: "proj-99" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockPush).toHaveBeenCalledWith("/proj-42");
  });

  test("creates a new project and redirects when sign-in succeeds and no projects exist", async () => {
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "fresh-project" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/fresh-project");
  });

  test("migrates anon work into a new project when sign-in succeeds", async () => {
    const anonMessages = [{ role: "user", content: "hello" }];
    const anonFs = { "/App.jsx": "export default () => <div/>" };
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({ messages: anonMessages, fileSystemData: anonFs });
    mockCreateProject.mockResolvedValue({ id: "migrated-project" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: anonMessages, data: anonFs })
    );
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/migrated-project");
    expect(mockGetProjects).not.toHaveBeenCalled();
  });

  test("does not migrate anon work when messages array is empty", async () => {
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
    mockGetProjects.mockResolvedValue([{ id: "existing-proj" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockClearAnonWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/existing-proj");
  });
});

describe("signUp", () => {
  test("calls signUpAction with email and password", async () => {
    mockSignUpAction.mockResolvedValue({ success: false, error: "Email taken" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "securepass");
    });

    expect(mockSignUpAction).toHaveBeenCalledWith("new@example.com", "securepass");
  });

  test("returns the result from signUpAction", async () => {
    const authResult = { success: false, error: "Email already registered" };
    mockSignUpAction.mockResolvedValue(authResult);

    const { result } = renderHook(() => useAuth());
    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.signUp("taken@example.com", "password123");
    });

    expect(returnValue).toEqual(authResult);
  });

  test("sets isLoading to true during execution and false after", async () => {
    let resolveSignUp!: (v: any) => void;
    mockSignUpAction.mockReturnValue(new Promise((res) => { resolveSignUp = res; }));

    const { result } = renderHook(() => useAuth());

    act(() => { result.current.signUp("new@example.com", "password123"); });
    expect(result.current.isLoading).toBe(true);

    await act(async () => { resolveSignUp({ success: false }); });
    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false even when signUpAction throws", async () => {
    mockSignUpAction.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("does not call handlePostSignIn when sign-up fails", async () => {
    mockSignUpAction.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("taken@example.com", "password123");
    });

    expect(mockGetProjects).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("migrates anon work into a new project when sign-up succeeds", async () => {
    const anonMessages = [{ role: "user", content: "build me a form" }];
    const anonFs = { "/App.jsx": "export default () => <form/>" };
    mockSignUpAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({ messages: anonMessages, fileSystemData: anonFs });
    mockCreateProject.mockResolvedValue({ id: "migrated-signup-project" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: anonMessages, data: anonFs })
    );
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/migrated-signup-project");
  });

  test("redirects to existing project when sign-up succeeds and projects exist", async () => {
    mockSignUpAction.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([{ id: "user-first-project" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockPush).toHaveBeenCalledWith("/user-first-project");
  });

  test("creates a new project and redirects when sign-up succeeds and no projects exist", async () => {
    mockSignUpAction.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "brand-new-project" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/brand-new-project");
  });
});

describe("new project naming", () => {
  test("migrated anon project name includes a time string", async () => {
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({
      messages: [{ role: "user", content: "hi" }],
      fileSystemData: {},
    });
    mockCreateProject.mockResolvedValue({ id: "x" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    const nameArg = mockCreateProject.mock.calls[0][0].name as string;
    expect(nameArg).toMatch(/^Design from /);
  });

  test("new blank project name starts with 'New Design'", async () => {
    mockSignInAction.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "x" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    const nameArg = mockCreateProject.mock.calls[0][0].name as string;
    expect(nameArg).toMatch(/^New Design #\d+$/);
  });
});
