import { WordSegmentBuilder, TwoColorWordBuilder } from "./WordSegmentBuilder";
import { isForceWidthCode } from "../../js/symbol_table";

function shouldForceWidth(u) {
  if (!u || u.length === 0) return false;
  return isForceWidthCode(u.charCodeAt(0));
}

export class ColorSegmentBuilder {
  constructor(forceWidth) {
    this.segs = [];
    this.wordBuilder = WordSegmentBuilder.NullObject;
    this.forceWidth = forceWidth;
    this.lead = null;
  }

  beginSegment(color) {
    this.segs.push(this.wordBuilder.build());
    this.wordBuilder = new WordSegmentBuilder(this.segs.length, color);
  }

  appendNormalChar(text, color) {
    if (!this.wordBuilder.isLastSegmentSameColor(color))
      this.beginSegment(color);
    this.wordBuilder.appendNormalText(text);
  }

  readChar(ch) {
    if (this.lead) {
      const { lead } = this;
      this.lead = null;

      if (ch.isDBCSTrail || ch.ch === '') {
        const leadColor = lead.getColor();
        const trailColor = ch.getColor();
        const text = lead.ch;

        if (!leadColor.equals(trailColor)) {
          this.segs.push(this.wordBuilder.build());
          this.wordBuilder = new TwoColorWordBuilder(
            this.segs.length,
            leadColor,
            trailColor,
            this.forceWidth
          );
          this.wordBuilder.appendNormalText(text);
          return;
        }

        const forceWidth = shouldForceWidth(text) ? this.forceWidth : 0;
        if (!forceWidth) {
          this.appendNormalChar(text, leadColor);
          return;
        }
        if (!this.wordBuilder.isLastSegmentSameColor(leadColor))
          this.beginSegment(leadColor);
        this.wordBuilder.appendForceWidthWord(text, forceWidth);
        return;
      }

      this.appendNormalChar(lead.ch, lead.getColor());
    }

    if (ch.isDBCSTrail || ch.ch === '') {
      return;
    }

    if (ch.isDBCSLead) {
      this.lead = ch;
      return;
    }

    if (shouldForceWidth(ch.ch) && this.forceWidth) {
      if (!this.wordBuilder.isLastSegmentSameColor(ch.getColor()))
        this.beginSegment(ch.getColor());
      this.wordBuilder.appendForceWidthWord(ch.ch, this.forceWidth);
      return;
    }

    this.appendNormalChar(ch.ch, ch.getColor());
  }

  build() {
    if (this.lead) {
      this.appendNormalChar(this.lead.ch, this.lead.getColor());
      this.lead = null;
    }
    this.beginSegment();
    return this.segs;
  }
}

ColorSegmentBuilder.accumulator = (builder, ch) => {
  builder.readChar(ch);
  return builder;
};

export default ColorSegmentBuilder;
