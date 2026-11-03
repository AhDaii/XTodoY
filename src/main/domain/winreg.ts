// 纯函数：解析 Windows `reg query` 输出（FR-REM-09），不依赖 Electron，便于单元测试

/** 读取 REG_DWORD 值；没有该值时返回 null */
export function parseRegDword(output: string, name: string): number | null {
  const m = new RegExp(`^\\s*${name}\\s+REG_DWORD\\s+0x([0-9a-f]+)`, 'im').exec(output);
  return m ? parseInt(m[1]!, 16) : null;
}
