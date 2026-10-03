import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded';
import TextSnippetRoundedIcon from '@mui/icons-material/TextSnippetRounded';
import { Button, Divider, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';
import { trackEvent } from '../lib/analytics';
import { canNativeShare, copyText, downloadText, shareText } from '../lib/share';
import { useToast } from './Toast';

type Build = () => string | Promise<string>;

/**
 * Share sheet on mobile; download / copy menu elsewhere. `build` produces the text lazily.
 * With `markdown`, the menu also offers MovieMango Markdown (re-importable on the Import page).
 */
export default function ShareButton({ title, filename, build, label = 'Share', what, markdown }: { title: string; filename: string; build: Build; label?: string; what: string; markdown?: Build }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const toast = useToast();
  const native = canNativeShare();
  const mdName = filename.replace(/\.txt$/, '') + '.md';

  const share = async (make: Build, name: string, format: string) => {
    setAnchor(null);
    const outcome = await shareText(title, await make(), name);
    trackEvent('share', { what, how: outcome, format });
    if (outcome === 'downloaded') toast(format === 'md' ? 'Saved as a Markdown file' : 'Saved as a text file');
  };
  const download = async (make: Build, name: string, format: string) => {
    setAnchor(null);
    downloadText(await make(), name, format === 'md' ? 'text/markdown' : 'text/plain');
    trackEvent('share', { what, how: 'download', format });
  };
  const copy = async (make: Build, format: string) => {
    setAnchor(null);
    const ok = await copyText(await make());
    toast(ok ? 'Copied to clipboard' : 'Couldn’t copy', ok ? 'success' : 'error');
    trackEvent('share', { what, how: 'copy', format });
  };

  const onClick = async (e: React.MouseEvent<HTMLElement>) => {
    if (!native || markdown) return setAnchor(e.currentTarget);
    await share(build, filename, 'text');
  };

  return (
    <>
      <Button variant="outlined" color="inherit" startIcon={<IosShareRoundedIcon />} onClick={onClick}>
        {label}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {native ? (
          <MenuItem onClick={() => share(build, filename, 'text')}>
            <ListItemIcon><IosShareRoundedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Share as text" />
          </MenuItem>
        ) : (
          <MenuItem onClick={() => download(build, filename, 'text')}>
            <ListItemIcon><DownloadRoundedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Download as text file" secondary={filename} />
          </MenuItem>
        )}
        <MenuItem onClick={() => copy(build, 'text')}>
          <ListItemIcon><ContentCopyRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Copy text" />
        </MenuItem>
        {markdown && <Divider />}
        {markdown &&
          (native ? (
            <MenuItem onClick={() => share(markdown, mdName, 'md')}>
              <ListItemIcon><TextSnippetRoundedIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Share as Markdown" secondary="Re-importable, AI-friendly" />
            </MenuItem>
          ) : (
            <MenuItem onClick={() => download(markdown, mdName, 'md')}>
              <ListItemIcon><TextSnippetRoundedIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Download as Markdown" secondary={mdName} />
            </MenuItem>
          ))}
        {markdown && (
          <MenuItem onClick={() => copy(markdown, 'md')}>
            <ListItemIcon><ContentCopyRoundedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Copy Markdown" />
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
