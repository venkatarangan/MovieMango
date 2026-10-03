import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { getReview, type ReviewSummary } from '../api/mangoidiots';
import { MangoBadge } from './Mango';

function cleanHtml(html: string) {
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'script'], FORBID_ATTR: ['style', 'onerror', 'onclick'] });
  // Open links outside the app and lazy-load images.
  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ').replace(/<img /g, '<img loading="lazy" ');
}

export default function ReviewReader({ review, open, onClose }: { review: ReviewSummary; open: boolean; onClose: () => void }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const q = useQuery({ queryKey: ['review', review.id], queryFn: () => getReview(review.id), enabled: open });
  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" color="text.secondary">
            Mangoidiots review
          </Typography>
          <Typography variant="h5" component="div">
            {review.title}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
            {review.rating && <MangoBadge rating={review.rating} size="small" />}
            <Typography variant="caption" color="text.secondary">
              by Venkatarangan Thirumalai · {new Date(review.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} aria-label="Close">
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {q.isLoading && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        )}
        {q.error && <Typography color="error">Couldn’t load the review. You can read it on Mangoidiots instead.</Typography>}
        {q.data && <Box className="review-body" dangerouslySetInnerHTML={{ __html: cleanHtml(q.data.html) }} />}
        <Box sx={{ mt: 3, mb: 1, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary">
            © Mangoidiots (mangoidiots.com). Shown with permission.
          </Typography>
          <Button href={review.link} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRoundedIcon />} variant="outlined" color="inherit" size="small">
            Open on Mangoidiots
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
