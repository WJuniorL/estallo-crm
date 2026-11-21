import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { MotivoDaPerdaNoCard } from "./MotivoDaPerdaNoCard";

it("na etapa de perda, mostra o motivo canônico pelo rótulo", () => {
  render(<MotivoDaPerdaNoCard etapaDePerda motivo="price" />);
  expect(screen.getByTestId("card-motivo-da-perda")).toHaveTextContent("Motivo da perda: Preço");
});

it("motivo próprio do funil sai como foi escrito", () => {
  render(<MotivoDaPerdaNoCard etapaDePerda motivo="Fechou com o concorrente" />);
  expect(screen.getByTestId("card-motivo-da-perda")).toHaveTextContent(
    "Motivo da perda: Fechou com o concorrente",
  );
});

it("fora da etapa de perda, ou sem motivo, não aparece", () => {
  const { container, rerender } = render(
    <MotivoDaPerdaNoCard etapaDePerda={false} motivo="price" />,
  );
  expect(container).toBeEmptyDOMElement();
  rerender(<MotivoDaPerdaNoCard etapaDePerda motivo="  " />);
  expect(container).toBeEmptyDOMElement();
});
