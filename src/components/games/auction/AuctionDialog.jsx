import React from 'react';
import GameDialog from '@/components/games/shared/GameDialog';

const AuctionDialog = (props) => (
  <GameDialog title="لعبة المزاد" backdropClassName="auction-modal-backdrop" className="auction-modal" {...props} />
);

export default AuctionDialog;
