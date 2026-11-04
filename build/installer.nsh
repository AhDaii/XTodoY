; XTodoY 安装向导的附加选项页（#29）：安装位置之后、开始安装之前显示。
; - 桌面快捷方式：可选，默认勾选。取消时在安装结束后删除 electron-builder 创建的桌面快捷方式。
; - 开始菜单快捷方式：固定勾选、不可取消。Windows 的提醒通知依赖带 AppUserModelID 的开始菜单快捷方式，
;   没有它通知可能不显示。
; 程序内更新（静默安装，--updated）不显示此页，也不改变用户已有的快捷方式（electron-builder 的 keepShortcuts）。

!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER
  Var xtDesktopCheckbox
  Var xtDesktopShortcut

  !macro customInit
    StrCpy $xtDesktopShortcut ${BST_CHECKED}
  !macroend

  ; 函数放在宏里：本文件在 electron-builder 注册插件之前被包含，宏展开时插件（isUpdated 用到 StdUtils）才可用
  !macro customPageAfterChangeDir
    Page custom xtOptionsPageCreate xtOptionsPageLeave

  Function xtOptionsPageCreate
    ${if} ${isUpdated}
      Abort
    ${endif}
    !insertmacro MUI_HEADER_TEXT "附加选项" "选择要创建的快捷方式。"
    nsDialogs::Create 1018
    Pop $0
    ${if} $0 == error
      Abort
    ${endif}

    ${NSD_CreateCheckbox} 0 0 100% 12u "创建桌面快捷方式"
    Pop $xtDesktopCheckbox
    ${NSD_SetState} $xtDesktopCheckbox $xtDesktopShortcut

    ${NSD_CreateCheckbox} 0 20u 100% 12u "创建开始菜单快捷方式"
    Pop $1
    ${NSD_Check} $1
    EnableWindow $1 0

    ${NSD_CreateLabel} 12u 34u 95% 24u "提醒通知需要开始菜单快捷方式，因此不能取消。"
    Pop $1
    EnableWindow $1 0

    nsDialogs::Show
  FunctionEnd

  Function xtOptionsPageLeave
    ${NSD_GetState} $xtDesktopCheckbox $xtDesktopShortcut
  FunctionEnd
  !macroend

  !macro customInstall
    ${ifNot} ${isUpdated}
    ${andIf} $xtDesktopShortcut != ${BST_CHECKED}
      WinShell::UninstShortcut "$newDesktopLink"
      Delete "$newDesktopLink"
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    ${endif}
  !macroend
!endif
