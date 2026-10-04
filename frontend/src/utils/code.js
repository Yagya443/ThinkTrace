export const LANGUAGES = [
    { id: "python", label: "Python", monaco: "python" },
    { id: "javascript", label: "JavaScript", monaco: "javascript" },
    { id: "java", label: "Java", monaco: "java" },
    { id: "cpp", label: "C++", monaco: "cpp" },
];

export const STARTERS = {
    python: "# Write your solution here\n\ndef solve():\n    pass\n",
    javascript: "// Write your solution here\n\nfunction solve() {\n\n}\n",
    java: "// Write your solution here\n\nclass Solution {\n    public void solve() {\n\n    }\n}\n",
    cpp: "// Write your solution here\n\n#include <vector>\nusing namespace std;\n\nclass Solution {\npublic:\n    void solve() {\n\n    }\n};\n",
};

/** True when the editor still holds only an untouched starter template (nothing real to submit). */
export const isStarter = (code) =>
    Object.values(STARTERS).some(
        (s) => s.trim() === String(code || "").trim(),
    ) || !String(code || "").trim();
