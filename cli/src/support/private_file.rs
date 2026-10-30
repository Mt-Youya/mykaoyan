use anyhow::{Context, Result};
use std::{io::Write, path::Path};

pub(crate) fn write(path: &Path, data: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut file = tempfile::NamedTempFile::new_in(parent).context("无法创建私有临时文件")?;
    #[cfg(windows)]
    {
        let status = std::process::Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "$p=$env:MYKAOYAN_ACL_PATH; $a=New-Object System.Security.AccessControl.FileSecurity; $a.SetAccessRuleProtection($true,$false); $s=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $r=New-Object System.Security.AccessControl.FileSystemAccessRule($s,'FullControl','Allow'); $a.AddAccessRule($r); Set-Acl -LiteralPath $p -AclObject $a",
            ])
            .env("MYKAOYAN_ACL_PATH", file.path())
            .output()
            .context("无法设置文件权限")?;
        if !status.status.success() {
            anyhow::bail!("无法限制凭据文件权限");
        }
    }
    file.write_all(data).context("无法写入文件")?;
    file.as_file().sync_all().context("无法刷新文件")?;
    file.persist(path)
        .map_err(|_| anyhow::anyhow!("无法保存文件"))?;
    Ok(())
}
