import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded';
import { Button, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';
import { trackEvent } from '../lib/analytics';
import { canNativeShare, copyText, downloadText, shareText } from '../lib/share';
import { useToast } from './Toast';

/** Share sheet on mobile; download / copy menu elsewhere. `build` produces the text lazily. */
export default function ShareButton({ title, filename, build, label = 'Share', what }: { title: string; filename: string; build: () => string | Promise<string>; label?: string; what: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const toast = useToast();
  const native = canNativeShare();

  const onClick = async (e: React.MouseEvent<HTMLElement>) => {
    if (!native) return setAnchor(e.currentTarget);
    const outcome = await shareText(title, await build(), filename);
    trackEvent('share', { what, how: outcome });
    if (outcome === 'downloaded') toast('Saved as a text file');
  };

  return (
    <>
      <Button variant="outlined" color="inherit" startIcon={<IosShareRoundedIcon />} onClick={onClick}>
        {label}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={async () => {
            setAnchor(null);
            downloadText(await build(), filename);
            trackEvent('share', { what, how: 'download' });
          }}
        >
          <ListItemIcon><DownloadRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Download as text file" secondary={filename} />
        </MenuItem>
        <MenuItem
          onClick={async () => {
            setAnchor(null);
            const ok = await copyText(await build());
            toast(ok ? 'Copied to clipboard' : 'Couldn’t copy', ok ? 'success' : 'error');
            trackEvent('share', { what, how: 'copy' });
          }}
        >
          <ListItemIcon><ContentCopyRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Copy text" />
        </MenuItem>
      </Menu>
    </>
  );
}
